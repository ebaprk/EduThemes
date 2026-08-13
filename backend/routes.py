import os
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
import sqlite3
from datetime import datetime, timedelta
import pandas as pd
import json
#from src.llm.claude_analysis import suggest_themes, classify_responses_by_themes, generate_summary, process_chat_query

from src.llm.serve_llm import serve_llm
from dataset_utils import preprocess_dataframe

routes_bp = Blueprint('routes', __name__)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

DATABASE = 'sessions.db'
COLORS = ['#f44336', '#e81e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722']
SUPPORTED_EXTENSIONS = {'.xlsx', '.xls', '.csv'}


def error_response(message, status=400, code='REQUEST_ERROR', retryable=False, details=None):
    payload = {
        'error': message,
        'code': code,
        'retryable': retryable,
    }
    if details:
        payload['details'] = details
    return jsonify(payload), status


def require_session(session_id):
    session = get_session(session_id)
    if not session:
        return None, error_response(
            'This analysis session has expired or is no longer available.',
            410,
            'SESSION_EXPIRED',
        )
    return session, None


def get_model(data):
    model = (data or {}).get('apiKey', '')
    return serve_llm(model)


def get_project_context(session):
    description = session['project_description'] or ''
    additional = session['additional_context'] or ''
    return f"{description}\n\nAdditional context: {additional}" if additional else description

def cleanup_expired_sessions():
    now = datetime.now()

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM sessions WHERE expires_at <= ?", (now,))
        expired_sessions = [row[0] for row in cursor.fetchall()]

        cursor.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        deleted = cursor.rowcount
        conn.commit()

    print(f"[Session Cleanup] Deleted {deleted} expired session(s)")

    for session_id in expired_sessions:
        delete_session_files(session_id)


def delete_session_files(session_id):
    for root, _, files in os.walk(UPLOAD_FOLDER):
        for filename in files:
            if filename.startswith(session_id):
                file_path = os.path.join(root, filename)
                try:
                    os.remove(file_path)
                except OSError:
                    continue

def init_db():
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                dataset_path TEXT,
                dataset_filename TEXT,
                status TEXT DEFAULT 'CREATED',
                labels TEXT,
                manual_coding TEXT,
                analysis_results TEXT,
                research_question TEXT,
                project_description TEXT,
                additional_context TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME
            )
        ''')
        conn.commit()
    

def create_session():
    import uuid
    from datetime import datetime, timedelta

    session_id = str(uuid.uuid4())
    expires_at = datetime.now() + timedelta(hours=24) 

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO sessions 
            (id, status, expires_at) 
            VALUES (?, ?, ?)
        ''', (session_id, 'CREATED', expires_at))
        conn.commit()
    
    return session_id


def update_session(session_id, **kwargs):
    update_fields = []
    values = []

    for key, value in kwargs.items():
        update_fields.append(f"{key} = ?")
        values.append(value)
    
    expires_at = datetime.now() + timedelta(hours=24)
    update_fields.append("expires_at = ?")
    values.append(expires_at)

    values.append(session_id)
    
    if update_fields:
        query = f"""
        UPDATE sessions 
        SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
        """
        
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute(query, values)
            conn.commit()


def get_session(session_id):
    with sqlite3.connect(DATABASE) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM sessions WHERE id = ?', (session_id,))
        return cursor.fetchone() 


@routes_bp.route('/session/start', methods=['POST'])
def start_session():
    try:
        cleanup_expired_sessions()
        session_id = create_session()
        return jsonify({"session_id": session_id})
    except Exception:
        return error_response(
            'The analysis service could not create a session. Please try again.',
            500,
            'SESSION_START_FAILED',
            True,
        )


@routes_bp.route('/session/<session_id>', methods=['GET'])
def session_status(session_id):
    cleanup_expired_sessions()
    session, error = require_session(session_id)
    if error:
        return error

    return jsonify({
        'session_id': session['id'],
        'status': session['status'],
        'expires_at': session['expires_at'],
        'dataset_filename': session['dataset_filename'],
    })


@routes_bp.route('/session/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    session, error = require_session(session_id)
    if error:
        return error

    delete_session_files(session_id)
    with sqlite3.connect(DATABASE) as conn:
        conn.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
        conn.commit()
    return '', 204


@routes_bp.route('/session/<session_id>/upload-dataset', methods=['POST'])
def upload_dataset(session_id):
    filepath = None
    try:
        cleanup_expired_sessions()
        session, error = require_session(session_id)
        if error:
            return error

        if 'dataset' not in request.files:
            return error_response('Choose an Excel or CSV file to continue.', code='FILE_REQUIRED')

        file = request.files['dataset']
        research_question = request.form.get('researchQuestion', '').strip()
        project_description = request.form.get('projectDescription', '').strip()
        additional_context = request.form.get('additionalContext', '')
        model = request.form.get('apiKey', '')

        if not research_question:
            return error_response('Enter a research question to continue.', code='RESEARCH_QUESTION_REQUIRED')
        if not project_description:
            return error_response('Enter a project description to continue.', code='PROJECT_DESCRIPTION_REQUIRED')
        try:
            serve_llm(model)
        except ValueError as exc:
            return error_response(str(exc), code='MODEL_REQUIRED')

        original_filename = secure_filename(file.filename or '')
        file_ext = os.path.splitext(original_filename)[1].lower()
        if file_ext not in SUPPORTED_EXTENSIONS:
            return error_response(
                'Use an Excel or CSV file (.xlsx, .xls, or .csv).',
                code='UNSUPPORTED_FILE_TYPE',
            )

        filename = secure_filename(f"{session_id}_{os.path.splitext(file.filename)[0]}")
        filepath = os.path.join(UPLOAD_FOLDER, f"{filename}{file_ext}")
        file.save(filepath)
        try:
            if file_ext.lower() in ['.xlsx', '.xls']:
                df = pd.read_excel(filepath)
            elif file_ext.lower() == '.csv':
                df = pd.read_csv(filepath)
            else:
                raise ValueError("Unsupported file format. Please use Excel or CSV files.")
            
            preprocessed_data, predefined_themes, dataset_summary = preprocess_dataframe(df, COLORS)
            
            if predefined_themes:
                update_session(session_id, labels=json.dumps(predefined_themes))
                
        except (ValueError, pd.errors.ParserError, UnicodeDecodeError) as exc:
            if filepath and os.path.exists(filepath):
                os.remove(filepath)
            return error_response(str(exc), 422, 'FILE_PROCESSING_FAILED')

        vis_placeholder = None
        update_session(session_id, 
            dataset_path=filepath, 
            dataset_filename=filename,
            research_question=research_question,
            project_description=project_description,
            additional_context=additional_context,
            status='DATASET_UPLOADED'
        )

        return jsonify({
            "message": "Dataset uploaded successfully",
            "session_id": session_id,
            "preprocessed_dataset": preprocessed_data,
            "predefined_themes": predefined_themes,
            "visualization_image": vis_placeholder,
            "dataset_summary": {"filename": original_filename, **dataset_summary},
        })
    except Exception:
        if filepath and os.path.exists(filepath):
            os.remove(filepath)
        return error_response(
            'The file could not be uploaded. Your session is still available; please try again.',
            500,
            'UPLOAD_FAILED',
            True,
        )


@routes_bp.route('/session/<session_id>/suggest-themes', methods=['POST'])
def get_theme_suggestions(session_id):
    spec_bool_py = False
    try:
        cleanup_expired_sessions()
        session, error = require_session(session_id)
        if error:
            return error
            
        data = request.get_json(silent=True)
        if not data:
            return error_response('The suggestion request was empty.', code='INVALID_REQUEST')
        try:
            specBool = data.get('specBool', '')
            if specBool and specBool == 'true':
                spec_bool_py = True
        except:
            pass

        if spec_bool_py:
            research_question = session['research_question']
            project_description = get_project_context(session)
            responses = data.get('response', '')
            if not responses:
                return error_response('There are no responses to analyze for this theme.', code='NO_RESPONSES')
            llm_instance = get_model(data)
            
            suggested_themes = llm_instance.suggest_themes(
                responses=responses,
                research_question=research_question,
                project_description=project_description,
                #predefined_themes=predefined_themes
                #api_key=api_key
            )
            
            return jsonify({
                "message": "Theme suggestions generated successfully",
                "suggested_themes": suggested_themes
            })

        predefined_themes = data.get('labels', [])
        
        dataset_path = session['dataset_path']
        if not dataset_path or not os.path.exists(dataset_path):
            return jsonify({"error": "Dataset not found"}), 404
            
        file_ext = os.path.splitext(dataset_path)[1].lower()
        if file_ext in ['.xlsx', '.xls']:
            df = pd.read_excel(dataset_path)
        elif file_ext == '.csv':
            df = pd.read_csv(dataset_path)
        else:
            return jsonify({"error": "Unsupported file format"}), 400
            
        responses_col = None
        if 'Response' in df.columns:
            responses_col = df['Response']
        elif 'Responses' in df.columns:
            responses_col = df['Responses']
        else:
            for col in df.columns:
                if 'response' in col.lower() or 'answer' in col.lower() or 'text' in col.lower():
                    responses_col = df[col]
                    break
            
            if responses_col is None and len(df.columns) > 0:
                responses_col = df.iloc[:, 0]
        
        if responses_col is not None:
            responses = responses_col.dropna().astype(str).tolist()
        else:
            return jsonify({"error": "No responses found in dataset"}), 400
        
            
        research_question = session['research_question']
        project_description = get_project_context(session)

        llm_instance = get_model(data)
        
        suggested_themes = llm_instance.suggest_themes(
            responses=responses,
            research_question=research_question,
            project_description=project_description,
            predefined_themes=predefined_themes
            #api_key=api_key
        )
        
        return jsonify({
            "message": "Theme suggestions generated successfully",
            "suggested_themes": suggested_themes
        })
    except ValueError as exc:
        return error_response(str(exc), code='MODEL_REQUIRED')
    except Exception:
        return error_response(
            'Theme suggestions could not be generated. Try again or choose another model.',
            502,
            'THEME_SUGGESTION_FAILED',
            True,
        )

@routes_bp.route('/session/<session_id>/submit-final-dataset', methods=['POST'])
def submit_final_dataset(session_id):
    try:
        cleanup_expired_sessions()
        session, error = require_session(session_id)
        if error:
            return error

        data = request.get_json()
        if not data or "dataset" not in data or "labels" not in data:
            return jsonify({"error": "Invalid request body"}), 400

        dataset = data["dataset"]
        model = data.get('apiKey', '')

        for entry in dataset:
            if 'themes' not in entry:
                entry['themes'] = []

        theme_counts = {}
        for entry in dataset:
            for theme in entry.get("themes", []):
                theme_name = theme["name"]
                theme_color = theme.get("color", "#cccccc")
                if theme_name not in theme_counts:
                    theme_counts[theme_name] = {"name": theme_name, "color": theme_color, "frequency": 0}
                theme_counts[theme_name]["frequency"] += 1
                
        try:
            dataset_path = session['dataset_path']
            if dataset_path and os.path.exists(dataset_path):
                file_ext = os.path.splitext(dataset_path)[1].lower()
                if file_ext in ['.xlsx', '.xls']:
                    df = pd.read_excel(dataset_path)
                elif file_ext == '.csv':
                    df = pd.read_csv(dataset_path)
                else:
                    raise ValueError("Unsupported file format")
                
                responses_col = None
                if 'Response' in df.columns:
                    responses_col = df['Response']
                elif 'Responses' in df.columns:
                    responses_col = df['Responses']
                else:
                    for col in df.columns:
                        if 'response' in col.lower() or 'answer' in col.lower() or 'text' in col.lower():
                            responses_col = df[col]
                            break
                    
                    if responses_col is None and len(df.columns) > 0:
                        responses_col = df.iloc[:, 0]
                
                if responses_col is not None:
                    responses = responses_col.dropna().astype(str).tolist()
                else:
                    responses = [entry["original"] for entry in dataset]
            
                #labels_str = session['labels']
                #labels = json.loads(labels_str) if labels_str else []
                labels = data["labels"]
                
                classifications = {}
                for theme in labels:
                    theme_name = theme['name']
                    classifications[theme_name] = []
                    
                for i, entry in enumerate(dataset):
                    for theme in entry.get("themes", []):
                        theme_name = theme["name"]
                        if theme_name in classifications:
                            classifications[theme_name].append(i)
                
                research_question = session['research_question']
                project_description = get_project_context(session)
                
                llm_instance = serve_llm(model)
                summary = llm_instance.generate_summary(
                    responses=responses,
                    themes=labels,
                    classifications=classifications,
                    research_question=research_question,
                    project_description=project_description,
                )
            else:
                summary = "No dataset found to generate summary."
        except Exception:
            return error_response(
                'The summary could not be generated. Your reviewed data remains available in this browser; please retry.',
                502,
                'SUMMARY_GENERATION_FAILED',
                True,
            )

        final_dataset_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_final_dataset.json")
        with open(final_dataset_path, 'w') as f:
            json.dump(dataset, f)
            
        summary_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_summary.txt")
        with open(summary_path, 'w') as f:
            f.write(summary)

        update_session(session_id, 
            analysis_results=json.dumps({
                "themes": list(theme_counts.values()),
                "summary": summary
            }),
            status='FINAL_DATASET_SUBMITTED'
        )

        return jsonify({
            "message": "Final dataset submitted successfully.",
            "themes": list(theme_counts.values()),
            "summary": summary
        })
    except ValueError as exc:
        return error_response(str(exc), code='MODEL_REQUIRED')
    except Exception:
        return error_response(
            'The final dataset could not be submitted. Your review is still available; please try again.',
            500,
            'FINAL_SUBMISSION_FAILED',
            True,
        )
    
@routes_bp.route('/session/<session_id>/submit-manual-coding', methods=['POST'])
def submit_manual_coding(session_id):
    spec_bool_py = False
    try:
        cleanup_expired_sessions()
        session, error = require_session(session_id)
        if error:
            return error

        data = request.get_json(silent=True)
        if not data:
            return error_response('The coding request was empty.', code='INVALID_REQUEST')
        try:
            specBool = data.get('specBool', '')
            if specBool and specBool == 'true':
                spec_bool_py = True
        except:
            pass

        if spec_bool_py:
            research_question = session['research_question']
            project_description = get_project_context(session)
            responses = data.get('response', '')
            labels = data["labels"]
            llm_instance = get_model(data)

            try:
                classifications = llm_instance.classify_responses_by_themes(
                    responses=responses,
                    themes=labels,
                    research_question=research_question,
                    project_description=project_description,
                    #api_key=api_key
                )
                
                return jsonify({
                    "message": "Manual coding submitted successfully.",
                    "claude_data": classifications,
                    "svm_data": {}
                })
                    
            except Exception:
                return error_response(
                    'These responses could not be reassigned. No classifications were changed.',
                    502,
                    'CLASSIFICATION_FAILED',
                    True,
                )

        if not data or "labels" not in data or "manual_codings" not in data:
            return jsonify({"error": "Invalid request body"}), 400

        labels = data["labels"]
        manual_codings = data["manual_codings"]
        llm_instance = get_model(data)


        manual_coding_folder = os.path.join(UPLOAD_FOLDER, "manual_codings")
        os.makedirs(manual_coding_folder, exist_ok=True)
        manual_coding_file = os.path.join(manual_coding_folder, f"{session_id}_manual_coding.json")
        with open(manual_coding_file, 'w') as f:
            json.dump(manual_codings, f)

        update_session(session_id, 
            labels=json.dumps(labels), 
            manual_coding=manual_coding_file,
            status='MANUAL_CODING_SUBMITTED'
        )

        dataset_path = session['dataset_path']
        if not dataset_path or not os.path.exists(dataset_path):
            return jsonify({"error": "Dataset not found"}), 404
            
        file_ext = os.path.splitext(dataset_path)[1].lower()
        if file_ext in ['.xlsx', '.xls']:
            df = pd.read_excel(dataset_path)
        elif file_ext == '.csv':
            df = pd.read_csv(dataset_path)
        else:
            return jsonify({"error": "Unsupported file format"}), 400
        
        responses_col = None
        if 'Response' in df.columns:
            responses_col = df['Response']
        elif 'Responses' in df.columns:
            responses_col = df['Responses']
        else:
            for col in df.columns:
                if 'response' in col.lower() or 'answer' in col.lower() or 'text' in col.lower():
                    responses_col = df[col]
                    break
        
            if responses_col is None and len(df.columns) > 0:
                responses_col = df.iloc[:, 0]
        
        if responses_col is not None:
            responses = responses_col.dropna().astype(str).tolist()
        else:
            return jsonify({"error": "No responses found in dataset"}), 400
            
        research_question = session['research_question']
        project_description = get_project_context(session)
        
        try:
            classifications = llm_instance.classify_responses_by_themes(
                responses=responses,
                themes=labels,
                research_question=research_question,
                project_description=project_description,
                manual_codes=manual_codings,
                #api_key=api_key
            )
            rez = jsonify({
                "message": "Manual coding submitted successfully.",
                "claude_data": classifications,
                "svm_data": {}
            })
            return rez
                
        except Exception:
            return error_response(
                'The model could not classify the responses. Your manual coding is saved; please retry or choose another model.',
                502,
                'CLASSIFICATION_FAILED',
                True,
            )

        final_dataset_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_final_dataset.json")
        with open(final_dataset_path, 'w') as f:
            json.dump(dataset, f)
            
        summary_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_summary.txt")
        with open(summary_path, 'w') as f:
            f.write(summary)

        update_session(session_id, 
            analysis_results=json.dumps({
                "themes": list(theme_counts.values()),
                "summary": summary
            }),
            status='FINAL_DATASET_SUBMITTED'
        )

        return jsonify({
            "message": "Final dataset submitted successfully.",
            "themes": list(theme_counts.values()),
            "summary": summary
        })
    except ValueError as exc:
        return error_response(str(exc), code='MODEL_REQUIRED')
    except Exception:
        return error_response(
            'Manual coding could not be submitted. Your work is still available in this browser.',
            500,
            'MANUAL_CODING_FAILED',
            True,
        )


@routes_bp.route('/session/<session_id>/download-final-dataset', methods=['GET'])
def download_final_dataset(session_id):
    try:
        cleanup_expired_sessions()
        session, error = require_session(session_id)
        if error:
            return error

        final_dataset_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_final_dataset.json")
        if not os.path.exists(final_dataset_path):
            return jsonify({"error": "Final dataset not found"}), 404

        with open(final_dataset_path, 'r') as f:
            final_dataset = json.load(f)
            
        summary = ""
        summary_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_summary.txt")
        if os.path.exists(summary_path):
            with open(summary_path, 'r') as f:
                summary = f.read()

        return jsonify({
            "message": "Final dataset retrieved successfully.",
            "final_dataset": final_dataset,
            "summary": summary
        })
    except Exception:
        return error_response(
            'The final dataset could not be downloaded. Please try again.',
            500,
            'DOWNLOAD_FAILED',
            True,
        )


@routes_bp.route('/session/<session_id>/analyze-text', methods=['POST'])
def analyze_text(session_id):
    try:
        cleanup_expired_sessions()
        session, error = require_session(session_id)
        if error:
            return error
            
        data = request.get_json()
        if not data or "message" not in data:
            return jsonify({"error": "Invalid request body"}), 400
            
        user_message = data["message"]
        
        dataset_path = session['dataset_path']
        if not dataset_path or not os.path.exists(dataset_path):
            return jsonify({"response": "Sorry, I don't have a dataset to analyze. Please upload a dataset first."}), 200
            
        file_ext = os.path.splitext(dataset_path)[1].lower()
        if file_ext in ['.xlsx', '.xls']:
            df = pd.read_excel(dataset_path)
        elif file_ext == '.csv':
            df = pd.read_csv(dataset_path)
        else:
            return jsonify({"response": "Sorry, I can't process this file format."}), 200
            
        responses_col = None
        if 'Response' in df.columns:
            responses_col = df['Response']
        elif 'Responses' in df.columns:
            responses_col = df['Responses']
        else:
            for col in df.columns:
                if 'response' in col.lower() or 'answer' in col.lower() or 'text' in col.lower():
                    responses_col = df[col]
                    break
            
            if responses_col is None and len(df.columns) > 0:
                responses_col = df.iloc[:, 0]
        
        if responses_col is not None:
            responses = responses_col.dropna().astype(str).tolist()
        else:
            return jsonify({"response": "Sorry, I couldn't identify the responses in your dataset."}), 200
        
        labels_str = session['labels']
        labels = json.loads(labels_str) if labels_str else []
    
        analysis_results_str = session['analysis_results']
        if analysis_results_str:
            analysis_results = json.loads(analysis_results_str)
        else:
            analysis_results = None
            
        research_question = session['research_question']
        project_description = get_project_context(session)
        
        final_dataset_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_final_dataset.json")
        if os.path.exists(final_dataset_path):
            with open(final_dataset_path, 'r') as f:
                final_dataset = json.load(f)
                
            classifications = {}
            for theme in labels:
                theme_name = theme['name']
                classifications[theme_name] = []
                
            for i, entry in enumerate(final_dataset):
                for theme in entry.get("themes", []):
                    theme_name = theme["name"]
                    if theme_name in classifications:
                        classifications[theme_name].append(i)
        else:
            classifications = {}
            
        llm_instance = get_model(data)
        response_text = llm_instance.process_chat_query(
            query=user_message,
            responses=responses,
            themes=labels,
            classifications=classifications,
            research_question=research_question,
            project_description=project_description
            #api_key==api_key
        )
        
        return jsonify({
            "response": response_text
        })
    except ValueError as exc:
        return error_response(str(exc), code='MODEL_REQUIRED')
    except Exception:
        return error_response(
            'The analysis question could not be answered. Please try again.',
            502,
            'ANALYSIS_QUERY_FAILED',
            True,
        )
