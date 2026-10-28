import copy
import json
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from flask import Flask

import lti


REGISTRATION = {
    'id': 'uf', 'issuer': 'https://canvas.instructure.com', 'client_id': 'client',
    'deployment_ids': ['approved'], 'auth_url': 'https://sso.canvaslms.com/api/lti/authorize_redirect',
    'jwks_url': 'https://sso.canvaslms.com/api/lti/security/jwks',
}
ENV = {
    'LTI_PUBLIC_URL': 'https://tool.example', 'LTI_PARTICIPANT_URL': 'https://participant.example',
    'LTI_REGISTRATIONS_JSON': json.dumps([REGISTRATION]),
    'SUPABASE_URL': 'https://database.example', 'SUPABASE_SERVICE_ROLE_KEY': 'test-service-key',
}


class CanvasTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def setUp(self):
        self.environment = patch.dict('os.environ', ENV)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.app = Flask(__name__)
        self.app.register_blueprint(lti.lti_bp)
        self.app.testing = True
        self.client = self.app.test_client()
        self.jwks = patch.object(lti, 'jwks_client', return_value=SimpleNamespace(
            get_signing_key_from_jwt=lambda _: SimpleNamespace(key=self.key.public_key())))
        self.jwks.start()
        self.addCleanup(self.jwks.stop)
        self.origin = {'Origin': ENV['LTI_PARTICIPANT_URL']}

    def claims(self):
        return {
            'iss': REGISTRATION['issuer'], 'aud': REGISTRATION['client_id'], 'sub': 'student-123',
            'iat': int(time.time()), 'exp': int(time.time()) + 300, 'nonce': 'nonce',
            lti.CLAIM + 'deployment_id': 'approved', lti.CLAIM + 'version': '1.3.0',
            lti.CLAIM + 'message_type': 'LtiResourceLinkRequest',
            lti.CLAIM + 'target_link_uri': 'https://tool.example/lti/launch',
            lti.CLAIM + 'resource_link': {'id': 'resource'},
            lti.CLAIM + 'roles': ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
            'name': 'Alex Student', 'email': 'alex@example.edu',
            lti.CLAIM + 'context': {'id': 'course-context', 'label': 'MAT101', 'title': 'Math'},
            lti.CLAIM + 'custom': {'academic_year': 'Junior', 'canvas_user_id': '12', 'unrelated': 'private'},
        }

    def sign(self, claims=None, key=None):
        return jwt.encode(claims or self.claims(), key or self.key, algorithm='RS256', headers={'kid': 'canvas-key'})

    def verify(self, token):
        return lti.verify_launch(token, REGISTRATION, 'nonce', 'https://tool.example/lti/launch')

    def test_valid_signed_launch(self):
        self.assertEqual(self.verify(self.sign())['sub'], 'student-123')

    def test_rejects_tampered_signature(self):
        with self.assertRaises(lti.LtiError):
            self.verify(self.sign(key=self.other_key))

    def test_rejects_invalid_required_claims(self):
        mutations = {
            'iss': 'https://attacker.example', 'aud': 'wrong-client', 'azp': 'wrong-client',
            'nonce': 'replayed', 'sub': '', 'exp': time.time() - 120, 'iat': time.time() - 700,
            lti.CLAIM + 'deployment_id': 'unapproved', lti.CLAIM + 'version': '1.1',
            lti.CLAIM + 'message_type': 'LtiDeepLinkingRequest',
            lti.CLAIM + 'target_link_uri': 'https://attacker.example',
            lti.CLAIM + 'resource_link': {}, lti.CLAIM + 'roles': 'Learner',
        }
        for field, value in mutations.items():
            with self.subTest(field=field):
                claims = self.claims()
                claims[field] = value
                with self.assertRaises(lti.LtiError):
                    self.verify(self.sign(claims))
        for field in ('iss', 'aud', 'exp', 'iat', 'sub', 'nonce'):
            with self.subTest(missing=field):
                claims = self.claims()
                del claims[field]
                with self.assertRaises(lti.LtiError):
                    self.verify(self.sign(claims))

    def test_audience_array_and_authorized_party(self):
        claims = self.claims()
        claims.update(aud=['client'], azp='client')
        self.verify(self.sign(claims))
        claims['aud'] = ['client', 'untrusted']
        with self.assertRaises(lti.LtiError):
            self.verify(self.sign(claims))

    def test_algorithm_confusion_and_malformed_tokens(self):
        tokens = ['bad', '', 'a' * 65537, None,
                  jwt.encode(self.claims(), 's' * 32, algorithm='HS256', headers={'kid': 'canvas-key'}),
                  jwt.encode(self.claims(), self.key, algorithm='RS256')]
        for token in tokens:
            with self.subTest(token_type=type(token).__name__), self.assertRaises(lti.LtiError):
                self.verify(token)

    def test_profile_allowlist_and_unavailable_substitutions(self):
        claims = self.claims()
        claims[lti.CLAIM + 'custom'].update(academic_year='$Canvas.user.year', major={'unsafe': 'value'})
        profile = lti.participant_profile(claims, REGISTRATION)
        self.assertEqual(profile['name'], 'Alex Student')
        self.assertEqual(profile['course_name'], 'Math')
        self.assertEqual(profile['canvas_user_id'], '12')
        for field in ('academic_year', 'major', 'unrelated', 'id_token'):
            self.assertNotIn(field, profile)
        anonymous = self.claims()
        for field in ('name', 'email', lti.CLAIM + 'custom', lti.CLAIM + 'context'):
            del anonymous[field]
        self.assertNotIn('name', lti.participant_profile(anonymous, REGISTRATION))

    def login(self, client=None):
        return (client or self.client).get('/lti/login', query_string={
            'iss': REGISTRATION['issuer'], 'client_id': 'client', 'login_hint': 'hint',
            'target_link_uri': 'https://tool.example/lti/launch', 'lti_message_hint': 'message',
        }, base_url='https://tool.example')

    def test_login_and_launch_single_use_browser_binding(self):
        logins, handoffs = {}, {}

        def rpc(name, args):
            if name == 'lti_create_login':
                logins[args['p_state_hash']] = args
            elif name == 'lti_consume_login':
                saved = logins.get(args['p_state_hash'])
                if saved and saved['p_browser_hash'] == args['p_browser_hash']:
                    del logins[args['p_state_hash']]
                    return {'nonce': saved['p_nonce'], 'registration_id': saved['p_registration_id']}
            elif name == 'lti_create_handoff':
                handoffs.update(args)

        with patch.object(lti, 'rpc', side_effect=rpc):
            login = self.login()
            self.assertEqual(login.status_code, 302)
            parameters = parse_qs(urlsplit(login.location).query)
            self.assertEqual(parameters['lti_message_hint'], ['message'])
            self.assertEqual(parameters['response_mode'], ['form_post'])
            self.assertIn('Secure', login.headers['Set-Cookie'])
            self.assertIn('HttpOnly', login.headers['Set-Cookie'])
            self.assertIn('SameSite=None', login.headers['Set-Cookie'])
            claims = self.claims()
            claims['nonce'] = parameters['nonce'][0]
            launch_data = {'state': parameters['state'][0], 'id_token': self.sign(claims)}
            # An otherwise valid signed launch in another browser is rejected.
            other = self.app.test_client()
            self.assertEqual(other.post('/lti/launch', data=launch_data, base_url='https://tool.example').status_code, 401)
            launch = self.client.post('/lti/launch', data=launch_data, base_url='https://tool.example')
            self.assertEqual(launch.status_code, 303)
            self.assertTrue(launch.location.startswith('https://participant.example/canvas#code='))
            self.assertEqual(handoffs['p_profile']['name'], 'Alex Student')
            self.assertNotIn('id_token', launch.location)
            self.assertEqual(launch.headers['Cache-Control'], 'no-store')
            self.assertEqual(self.client.post('/lti/launch', data=launch_data, base_url='https://tool.example').status_code, 401)

    def test_unknown_platform_and_redirect_rejected_before_storage(self):
        with patch.object(lti, 'rpc') as rpc:
            self.assertEqual(self.client.get('/lti/login?iss=https://evil.example').status_code, 401)
            response = self.client.post('/lti/login', data={
                'iss': REGISTRATION['issuer'], 'client_id': 'client', 'login_hint': 'x',
                'target_link_uri': 'https://evil.example',
            })
            self.assertEqual(response.status_code, 400)
            rpc.assert_not_called()

    def test_login_accepts_post_and_omitted_client_id_when_unambiguous(self):
        with patch.object(lti, 'rpc'):
            response = self.client.post('/lti/login', data={
                'iss': REGISTRATION['issuer'], 'login_hint': 'x',
                'target_link_uri': 'https://tool.example/lti/launch',
            })
            self.assertEqual(response.status_code, 302)

    def test_session_exchange_requires_origin_and_single_use_code(self):
        with patch.object(lti, 'rpc', return_value={'name': 'Alex'}) as rpc:
            self.assertEqual(self.client.post('/lti/exchange', json={'code': 'a' * 43}).status_code, 403)
            rpc.assert_not_called()
            response = self.client.post('/lti/exchange', json={'code': 'a' * 43}, headers=self.origin)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json['access_token']), 43)
            self.assertNotEqual(rpc.call_args.args[1]['p_token_hash'], response.json['access_token'])
        with patch.object(lti, 'rpc', return_value=None):
            self.assertEqual(self.client.post('/lti/exchange', json={'code': 'a' * 43}, headers=self.origin).status_code, 401)

    def test_missing_expired_session_and_revocation(self):
        with patch.object(lti, 'rpc', return_value=None) as rpc:
            self.assertEqual(self.client.get('/lti/session', headers=self.origin).status_code, 401)
            rpc.assert_not_called()
            headers = {**self.origin, 'Authorization': 'Bearer ' + 't' * 43}
            self.assertEqual(self.client.get('/lti/session', headers=headers).status_code, 401)
            self.assertEqual(self.client.delete('/lti/session', headers=headers).status_code, 204)
            self.assertEqual(rpc.call_args.args[0], 'lti_delete_session')

    def test_submission_uses_verified_server_identity_and_explicit_sharing(self):
        headers = {**self.origin, 'Authorization': 'Bearer ' + 't' * 43}
        body = {'code': 'ABCDEF123456', 'answers': {'q': 'answer'}, 'request_id': str(uuid4())}
        with patch.object(lti, 'rpc', return_value='submission-id') as rpc:
            self.assertEqual(self.client.post('/lti/submit', json=body, headers=headers).status_code, 400)
            rpc.assert_not_called()
            body.update(share_participant_details=True, participant_data={'name': 'Forged'})
            result = self.client.post('/lti/submit', json=body, headers=headers)
            self.assertEqual(result.status_code, 201)
            self.assertEqual(result.json['submission_id'], 'submission-id')
            arguments = rpc.call_args.args[1]
            self.assertNotIn('participant_data', arguments)
            self.assertEqual(arguments['p_token_hash'], lti.digest('t' * 43))
            for field, value in [('answers', {'q': 123}), ('request_id', 'invalid'), ('code', 'bad')]:
                invalid = copy.deepcopy(body)
                invalid[field] = value
                self.assertIn(self.client.post('/lti/submit', json=invalid, headers=headers).status_code, (400, 422))

    def test_downstream_error_does_not_expose_secrets(self):
        request = httpx.Request('POST', 'https://database.example')
        response = httpx.Response(500, json={'message': 'private-token-and-student-name'}, request=request)
        with self.app.app_context(), patch.object(httpx, 'post', return_value=response):
            with self.assertRaises(lti.LtiError) as error:
                lti.rpc('lti_get_session', {})
            self.assertNotIn('private-token', str(error.exception))
            self.assertEqual(error.exception.status, 503)

    def test_versioned_submission_passes_explicit_consent_and_version_to_database(self):
        headers = {**self.origin, 'Authorization': 'Bearer ' + 't' * 43}
        body = {'code': 'ABCDEF123456', 'answers': {'q': 'answer'}, 'request_id': str(uuid4()),
                'version_id': str(uuid4()), 'consent_accepted': True, 'share_participant_details': True}
        with patch.object(lti, 'rpc', return_value='submission-id') as rpc:
            self.assertEqual(self.client.post('/lti/submit', json=body, headers=headers).status_code, 201)
            self.assertEqual(rpc.call_args.args[0], 'submit_canvas_study_version')
            self.assertEqual(rpc.call_args.args[1]['p_version_id'], body['version_id'])
            self.assertIs(rpc.call_args.args[1]['p_consent_accepted'], True)
            for field, value in [('version_id', 'bad'), ('consent_accepted', 'true')]:
                invalid = {**body, field: value}
                self.assertEqual(self.client.post('/lti/submit', json=invalid, headers=headers).status_code, 422)

    def test_unconfigured_integration_fails_closed(self):
        with patch.dict('os.environ', {'LTI_REGISTRATIONS_JSON': '[]'}):
            self.assertEqual(self.login().status_code, 503)

    def test_registration_config_has_no_roster_or_grade_permissions(self):
        result = self.client.get('/lti/config')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['scopes'], [])
        self.assertEqual(result.json['extensions'][0]['settings']['placements'][0]['windowTarget'], '_blank')
        public_key = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
        public_key.update(alg='RS256', kid='tool-key')
        with patch.dict('os.environ', {'LTI_TOOL_PUBLIC_JWK': json.dumps(public_key)}):
            self.assertEqual(self.client.get('/lti/jwks').json['keys'], [public_key])
        public_key['d'] = 'private-material'
        with patch.dict('os.environ', {'LTI_TOOL_PUBLIC_JWK': json.dumps(public_key)}):
            self.assertEqual(self.client.get('/lti/jwks').status_code, 503)


if __name__ == '__main__':
    unittest.main()
