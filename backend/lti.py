"""Launch-only Canvas LTI 1.3. No Canvas API tokens or roster/grade scopes."""

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from functools import lru_cache
from urllib.parse import urlencode, urlsplit
from uuid import UUID

import httpx
import jwt
from flask import Blueprint, current_app, jsonify, redirect, request

lti_bp = Blueprint('lti', __name__, url_prefix='/lti')
CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/'
OPAQUE = re.compile(r'^[A-Za-z0-9_-]{43}$')


class LtiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def https_url(value, *, local=False):
    if not isinstance(value, str):
        raise LtiError('Canvas integration has an invalid URL configuration.', 503)
    parsed = urlsplit(value)
    if (not parsed.hostname or parsed.username or parsed.password or parsed.query
            or parsed.fragment or (parsed.scheme != 'https' and not (
                local and parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1')))):
        raise LtiError('Canvas integration requires configured HTTPS URLs.', 503)
    return value.rstrip('/')


def settings():
    public = https_url(os.getenv('LTI_PUBLIC_URL', ''))
    participant = https_url(os.getenv('LTI_PARTICIPANT_URL', ''), local=True)
    if urlsplit(participant).path not in ('', '/'):
        raise LtiError('LTI_PARTICIPANT_URL must be the participant site origin.', 503)
    try:
        registrations = json.loads(os.getenv('LTI_REGISTRATIONS_JSON', '[]'))
        if not isinstance(registrations, list) or not registrations:
            raise ValueError()
        seen = set()
        for registration in registrations:
            for key in ('id', 'issuer', 'client_id', 'auth_url', 'jwks_url'):
                if not isinstance(registration[key], str) or not registration[key]:
                    raise ValueError()
            for key in ('issuer', 'auth_url', 'jwks_url'):
                https_url(registration[key])
            deployments = registration['deployment_ids']
            if not isinstance(deployments, list) or not deployments or not all(
                    isinstance(item, str) and item for item in deployments):
                raise ValueError()
            identity = (registration['issuer'], registration['client_id'])
            if registration['id'] in seen or identity in seen:
                raise ValueError()
            seen.update((registration['id'], identity))
    except (ValueError, TypeError, KeyError):
        raise LtiError('Canvas integration needs an approved platform registration.', 503) from None
    return public, participant, registrations


def rpc(name, arguments):
    """Service credential stays on the server; all identity writes are service-only RPCs."""
    base = https_url(os.getenv('SUPABASE_URL', ''))
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    if not key:
        raise LtiError('Canvas integration is not configured on the server.', 503)
    try:
        response = httpx.post(
            f'{base}/rest/v1/rpc/{name}', json=arguments,
            headers={'apikey': key, 'Authorization': f'Bearer {key}'}, timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as error:
        # Never expose SQL, credentials, launch claims, or downstream error bodies.
        try:
            code = error.response.json().get('code')
        except ValueError:
            code = None
        if code == 'PT401':
            raise LtiError('Your Canvas session expired. Open EduThemes from Canvas again.', 401) from None
        if code == 'PT422':
            raise LtiError('The study is closed or the answers are incomplete. Refresh the study and try again.', 422) from None
        if code == 'PT409':
            raise LtiError('This submission was already used for different answers. Refresh before submitting again.', 409) from None
        current_app.logger.error('Canvas database operation failed: %s (HTTP %s)', name, error.response.status_code)
        raise LtiError('Canvas data could not be saved. Please try again.', 503) from None
    except (httpx.HTTPError, ValueError):
        raise LtiError('The Canvas connection is temporarily unavailable. Please try again.', 503) from None


@lru_cache(maxsize=32)
def jwks_client(url):
    # The URL comes ONLY from trusted server configuration, never a JWT header.
    return jwt.PyJWKClient(url, timeout=10, lifespan=300)


def verify_launch(token, registration, nonce, target):
    try:
        if not isinstance(token, str) or len(token) > 65536:
            raise ValueError()
        header = jwt.get_unverified_header(token)
        if header.get('alg') != 'RS256' or not isinstance(header.get('kid'), str) or not header['kid']:
            raise ValueError()
        key = jwks_client(registration['jwks_url']).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token, key.key, algorithms=['RS256'], issuer=registration['issuer'],
            audience=registration['client_id'], leeway=30,
            options={'require': ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce']},
        )
        audiences = claims['aud'] if isinstance(claims['aud'], list) else [claims['aud']]
        # This tool has a single registered audience. Reject untrusted co-audiences.
        if audiences != [registration['client_id']]:
            raise ValueError()
        if 'azp' in claims and claims['azp'] != registration['client_id']:
            raise ValueError()
        if not isinstance(claims['nonce'], str) or not hmac.compare_digest(claims['nonce'], nonce):
            raise ValueError()
        if any(isinstance(claims[k], bool) or not isinstance(claims[k], (int, float)) for k in ('iat', 'exp')):
            raise ValueError()
        if claims['iat'] < time.time() - 600 or claims['exp'] <= claims['iat']:
            raise ValueError()
        if not claims['sub'] or len(claims['sub']) > 255 or not claims['sub'].isascii():
            raise ValueError()
        if claims.get(CLAIM + 'deployment_id') not in registration['deployment_ids']:
            raise ValueError()
        if claims.get(CLAIM + 'version') != '1.3.0' or claims.get(CLAIM + 'message_type') != 'LtiResourceLinkRequest':
            raise ValueError()
        if claims.get(CLAIM + 'target_link_uri') != target:
            raise ValueError()
        resource = claims.get(CLAIM + 'resource_link')
        roles = claims.get(CLAIM + 'roles')
        if not isinstance(resource, dict) or not isinstance(resource.get('id'), str) or not resource['id']:
            raise ValueError()
        if not isinstance(roles, list) or not roles or not all(isinstance(role, str) for role in roles):
            raise ValueError()
        return claims
    except jwt.PyJWKClientConnectionError:
        raise LtiError('Canvas signing keys are temporarily unavailable. Launch again from Canvas.', 503) from None
    except (jwt.PyJWTError, ValueError, TypeError, AttributeError):
        raise LtiError('Canvas could not be verified. Open EduThemes from your approved Canvas course again.', 401) from None


def participant_profile(claims, registration):
    """Persist a bounded allowlist, never the raw ID token or arbitrary custom claims."""
    profile = {
        'source': 'canvas', 'issuer': claims['iss'], 'client_id': registration['client_id'],
        'deployment_id': claims[CLAIM + 'deployment_id'], 'subject': claims['sub'],
        'verified_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }

    def add(name, value):
        if isinstance(value, str) and value.strip() and not value.strip().startswith('$'):
            profile[name] = value.strip()[:500]

    for field in ('name', 'given_name', 'family_name', 'email', 'locale'):
        add(field, claims.get(field))
    context = claims.get(CLAIM + 'context')
    if isinstance(context, dict):
        for field, key in (('course_context_id', 'id'), ('course_name', 'title'), ('course_code', 'label')):
            add(field, context.get(key))
    custom = claims.get(CLAIM + 'custom')
    if isinstance(custom, dict):
        for field in ('canvas_user_id', 'canvas_course_id', 'academic_year', 'major'):
            add(field, custom.get(field))
    profile['roles'] = [role[:500] for role in claims[CLAIM + 'roles'][:20]]
    return profile


def browser_cookie(state):
    return '__Host-eduthemes-lti-' + digest(state)[:16]


@lti_bp.errorhandler(LtiError)
def lti_error(error):
    return jsonify(error=str(error)), error.status


@lti_bp.after_request
def private_response(response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none'"
    return response


@lti_bp.route('/login', methods=['GET', 'POST'])
def login():
    public, _participant, registrations = settings()
    params = request.args if request.method == 'GET' else request.form
    matches = [r for r in registrations if r['issuer'] == params.get('iss') and (
        not params.get('client_id') or r['client_id'] == params.get('client_id'))]
    if len(matches) != 1:
        raise LtiError('This Canvas platform is not registered with EduThemes.', 401)
    registration = matches[0]
    target = public + '/lti/launch'
    if params.get('target_link_uri') != target or not params.get('login_hint'):
        raise LtiError('Invalid Canvas login request.')
    if params.get('lti_deployment_id') and params['lti_deployment_id'] not in registration['deployment_ids']:
        raise LtiError('This Canvas deployment is not approved.', 401)
    state, nonce, browser = (secrets.token_urlsafe(32) for _ in range(3))
    rpc('lti_create_login', {
        'p_state_hash': digest(state), 'p_nonce': nonce,
        'p_browser_hash': digest(browser), 'p_registration_id': registration['id'],
    })
    arguments = {
        'scope': 'openid', 'response_type': 'id_token', 'response_mode': 'form_post',
        'prompt': 'none', 'client_id': registration['client_id'], 'redirect_uri': target,
        'login_hint': params['login_hint'], 'state': state, 'nonce': nonce,
    }
    if params.get('lti_message_hint'):
        arguments['lti_message_hint'] = params['lti_message_hint']
    response = redirect(registration['auth_url'] + '?' + urlencode(arguments), code=302)
    response.set_cookie(browser_cookie(state), browser, max_age=600, secure=True,
                        httponly=True, samesite='None', path='/')
    return response


@lti_bp.post('/launch')
def launch():
    public, participant, registrations = settings()
    state = request.form.get('state', '')
    browser = request.cookies.get(browser_cookie(state), '')
    if not OPAQUE.fullmatch(state) or not OPAQUE.fullmatch(browser):
        raise LtiError('Canvas login could not be matched to this browser. Open the tool in a new window from Canvas and allow cookies.', 401)
    pending = rpc('lti_consume_login', {'p_state_hash': digest(state), 'p_browser_hash': digest(browser)})
    if not pending:
        raise LtiError('This Canvas login expired or was already used. Launch again from Canvas.', 401)
    registration = next((r for r in registrations if r['id'] == pending['registration_id']), None)
    if not registration:
        raise LtiError('This Canvas registration is no longer available.', 401)
    claims = verify_launch(request.form.get('id_token'), registration, pending['nonce'], public + '/lti/launch')
    handoff = secrets.token_urlsafe(32)
    rpc('lti_create_handoff', {'p_handoff_hash': digest(handoff), 'p_profile': participant_profile(claims, registration)})
    # Only a single-use, 60-second code travels in a fragment; never an ID/session token.
    response = redirect(participant + '/canvas#code=' + handoff, code=303)
    response.delete_cookie(browser_cookie(state), secure=True, httponly=True, samesite='None')
    return response


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise LtiError('A JSON request is required.')
    return data


def require_origin():
    _public, participant, _registrations = settings()
    if request.headers.get('Origin') != participant:
        raise LtiError('Use the EduThemes participant site for this request.', 403)


def session_hash():
    authorization = request.headers.get('Authorization', '')
    token = authorization.removeprefix('Bearer ')
    if not authorization.startswith('Bearer ') or not OPAQUE.fullmatch(token):
        raise LtiError('Open EduThemes from Canvas to connect your participant details.', 401)
    return digest(token)


@lti_bp.post('/exchange')
def exchange():
    require_origin()
    handoff = json_body().get('code', '')
    if not isinstance(handoff, str) or not OPAQUE.fullmatch(handoff):
        raise LtiError('Invalid Canvas launch code.', 401)
    token = secrets.token_urlsafe(32)
    profile = rpc('lti_exchange_handoff', {'p_handoff_hash': digest(handoff), 'p_token_hash': digest(token)})
    if not profile:
        raise LtiError('This Canvas launch expired or was already used. Launch again from Canvas.', 401)
    return jsonify(access_token=token, participant=profile)


@lti_bp.get('/session')
def session():
    require_origin()
    profile = rpc('lti_get_session', {'p_token_hash': session_hash()})
    if not profile:
        raise LtiError('Your Canvas session expired. Open EduThemes from Canvas again.', 401)
    return jsonify(participant=profile)


@lti_bp.delete('/session')
def logout():
    require_origin()
    rpc('lti_delete_session', {'p_token_hash': session_hash()})
    return '', 204


@lti_bp.post('/submit')
def submit():
    require_origin()
    token_hash = session_hash()
    data = json_body()
    if data.get('share_participant_details') is not True:
        raise LtiError('Confirm sharing your Canvas details before submitting.')
    if not isinstance(data.get('code'), str) or not re.fullmatch(r'[A-Fa-f0-9]{12}', data['code']):
        raise LtiError('Enter a valid study code.')
    if not isinstance(data.get('answers'), dict) or not data['answers'] or len(data['answers']) > 12:
        raise LtiError('Complete the study questions before submitting.', 422)
    if any(not isinstance(value, str) or not 1 <= len(value.strip()) <= 10000 for value in data['answers'].values()):
        raise LtiError('Each answer must contain 1 to 10000 characters.', 422)
    try:
        request_id = str(UUID(data.get('request_id', ''), version=None))
    except (ValueError, TypeError, AttributeError):
        raise LtiError('A valid submission request ID is required.') from None
    submission_id = rpc('submit_canvas_study', {
        'p_code': data['code'], 'p_answers': data['answers'],
        'p_token_hash': token_hash, 'p_request_id': request_id,
    })
    return jsonify(submission_id=submission_id), 201


@lti_bp.get('/jwks')
def tool_jwks():
    try:
        key = json.loads(os.getenv('LTI_TOOL_PUBLIC_JWK', ''))
        if key.get('kty') != 'RSA' or key.get('alg') != 'RS256' or not key.get('kid') or any(
                field in key for field in ('d', 'p', 'q', 'dp', 'dq', 'qi')):
            raise ValueError()
        jwt.PyJWK.from_dict(key)
    except (ValueError, TypeError, AttributeError, jwt.PyJWTError):
        raise LtiError('Configure the tool public signing key before registration.', 503) from None
    return jsonify(keys=[key])


@lti_bp.get('/config')
def configuration():
    public = https_url(os.getenv('LTI_PUBLIC_URL', ''))
    return jsonify({
        'title': 'EduThemes', 'description': 'Participate in EduThemes research studies.',
        'oidc_initiation_url': public + '/lti/login', 'target_link_uri': public + '/lti/launch',
        'public_jwk_url': public + '/lti/jwks', 'scopes': [],
        'custom_fields': {'canvas_user_id': '$Canvas.user.id', 'canvas_course_id': '$Canvas.course.id'},
        'extensions': [{
            'platform': 'canvas.instructure.com', 'privacy_level': 'public',
            'settings': {'text': 'EduThemes', 'placements': [{
                'placement': 'course_navigation', 'message_type': 'LtiResourceLinkRequest',
                'target_link_uri': public + '/lti/launch', 'text': 'EduThemes',
                'windowTarget': '_blank', 'visibility': 'members', 'default': 'disabled',
            }]},
        }],
    })
