import os
from flask import Flask
from flask_cors import CORS
from routes import routes_bp, init_db


def create_app():
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024
    allowed_origins = os.getenv(
        'CORS_ORIGINS',
        'http://localhost:3000,http://127.0.0.1:3000'
    ).split(',')
    CORS(app, origins=[origin.strip() for origin in allowed_origins if origin.strip()])

    app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    init_db()
    app.register_blueprint(routes_bp)

    @app.get('/health')
    def health():
        return {'status': 'ok'}

    @app.get('/models')
    def models():
        return {
            'models': {
                'claude': bool(os.getenv('ANTHROPIC_API_KEY')),
                'chatgpt': bool(os.getenv('OPENAI_API_KEY')),
            }
        }

    @app.errorhandler(413)
    def file_too_large(_error):
        return {
            'error': 'The selected file is larger than the 20 MB upload limit.',
            'code': 'FILE_TOO_LARGE',
            'retryable': False,
        }, 413
    
    return app

app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
