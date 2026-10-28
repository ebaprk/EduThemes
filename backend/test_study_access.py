import os
import json
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import httpx
from app import app
import routes
from study_access import require_study_access, StudyAccessError


class StudyAccessTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db = patch.object(routes, 'DATABASE', os.path.join(self.directory.name, 'sessions.db'))
        self.db.start()
        self.addCleanup(self.db.stop)
        routes.init_db()
        self.client = app.test_client()
        self.study = str(uuid4())
        self.env = patch.dict(os.environ, {'SUPABASE_URL': 'https://database.example', 'SUPABASE_PUBLISHABLE_KEY': 'public-key'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def response(self, role, status=200):
        return httpx.Response(status, content=json.dumps(role), request=httpx.Request('POST', 'https://database.example/rest/v1/rpc/study_role'))

    def test_study_sessions_require_current_edit_access(self):
        with patch('study_access.httpx.post') as post:
            self.assertEqual(self.client.post('/session/start', json={'study_id': self.study}).status_code, 401)
            post.assert_not_called()
        for role, status in [('owner', 200), ('researcher', 200), ('reviewer', 403), (None, 403)]:
            with patch('study_access.httpx.post', return_value=self.response(role)) as post:
                result = self.client.post('/session/start', json={'study_id': self.study}, headers={'Authorization': 'Bearer researcher-jwt'})
                self.assertEqual(result.status_code, status)
                self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer researcher-jwt')
                if status == 200:
                    self.assertEqual(routes.get_session(result.json['session_id'])['study_id'], self.study)

    def test_membership_is_rechecked_on_read_mutation_export_and_deletion(self):
        session = routes.create_session(self.study)
        headers = {'Authorization': 'Bearer researcher-jwt'}
        with patch('study_access.httpx.post', return_value=self.response(None)):
            for method, path in [('get', ''), ('get', '/download-final-dataset'), ('post', '/suggest-themes'), ('delete', '')]:
                result = getattr(self.client, method)(f'/session/{session}{path}', headers=headers)
                self.assertEqual(result.status_code, 403)
        with patch('study_access.httpx.post', return_value=self.response('reviewer')):
            self.assertEqual(self.client.get(f'/session/{session}', headers=headers).status_code, 200)
            self.assertEqual(self.client.delete(f'/session/{session}', headers=headers).status_code, 403)
        self.assertIsNotNone(routes.get_session(session))

    def test_network_failures_and_invalid_tokens_fail_closed_without_private_details(self):
        with app.test_request_context(headers={'Authorization': 'Bearer expired'}):
            with patch('study_access.httpx.post', return_value=self.response({'message': 'private details'}, 401)):
                with self.assertRaises(StudyAccessError) as error:
                    require_study_access(self.study)
                self.assertEqual(error.exception.status, 401)
                self.assertNotIn('private details', str(error.exception))
            with patch('study_access.httpx.post', side_effect=httpx.ConnectError('internal host')):
                with self.assertRaises(StudyAccessError) as error:
                    require_study_access(self.study)
                self.assertEqual(error.exception.status, 503)
                self.assertNotIn('internal host', str(error.exception))

    def test_legacy_file_analysis_sessions_remain_usable(self):
        session = routes.create_session()
        with patch('study_access.httpx.post') as post:
            self.assertEqual(self.client.get(f'/session/{session}').status_code, 200)
            post.assert_not_called()


if __name__ == '__main__':
    unittest.main()
