"""Supabase-backed queue. Leases fence restarted workers; inputs never use local files."""
import logging
import os
import threading
import httpx
from src.llm.serve_llm import serve_llm

log = logging.getLogger(__name__)
_started = False
_lock = threading.Lock()


def rpc(name, body):
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    response = httpx.post(os.environ['SUPABASE_URL'].rstrip('/') + '/rest/v1/rpc/' + name,
        headers={'apikey': key, 'Authorization': 'Bearer ' + key}, json=body, timeout=30)
    response.raise_for_status()
    return response.json()


def process(job):
    payload = job['payload']
    dataset, labels = payload['dataset'], payload['labels']
    model = serve_llm('navigator')
    context = dict(research_question=payload.get('researchQuestion', ''),
                   project_description=payload.get('projectDescription', '') + '\n' + payload.get('additionalContext', ''))
    responses = [entry['original'] for entry in dataset]
    if job['kind'] == 'classify':
        manual = [{'index': i, 'themes': entry.get('themes', [])} for i, entry in enumerate(dataset) if entry.get('themes')]
        return {'claude_data': model.classify_responses_by_themes(responses=responses, themes=labels, manual_codes=manual, **context), 'svm_data': {}}
    classifications = {theme['name']: [i for i, entry in enumerate(dataset) if any(t['name'] == theme['name'] for t in entry.get('themes', []))] for theme in labels}
    summary = model.generate_summary(responses=responses, themes=labels, classifications=classifications, **context)
    return {'themes': [dict(name=t['name'], color=t.get('color', '#cccccc'), frequency=len(classifications[t['name']])) for t in labels], 'summary': summary}


def execute(job):
    stop = threading.Event()
    lost = threading.Event()
    def update(status, **kwargs):
        return rpc('update_analysis_job', dict(p_id=job['id'], p_token=job['lease_token'], p_status=status, **kwargs))
    def heartbeat():
        while not stop.wait(20):
            try:
                if not update('running'):
                    lost.set()
                    return
            except Exception:
                # Do not persist an unfenced result after a prolonged connection failure.
                lost.set()
                return
    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        result = process(job)
        stop.set()
        thread.join()
        if not lost.is_set():
            update('completed', p_result=result)
    except Exception:
        stop.set()
        thread.join()
        if not lost.is_set():
            update('failed', p_error='Analysis could not finish. Your submitted responses and themes are saved. Retry this job to continue.')
    finally:
        stop.set()


def run():
    while True:
        try:
            job = rpc('claim_analysis_job', {})
            if job:
                execute(job)
                continue
        except Exception:
            log.warning('Analysis queue unavailable; retrying shortly.')
        threading.Event().wait(10)


def start_worker():
    global _started
    if not os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('ANALYSIS_JOBS_ENABLED') != 'true':
        return
    with _lock:
        if _started:
            return
        _started = True
        threading.Thread(target=run, daemon=True, name='analysis-jobs').start()
