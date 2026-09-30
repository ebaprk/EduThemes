import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app import app
import routes
from src.llm.openai_analysis import NavigatorError, _chat_completion, _create_client, navigator_llm
from src.llm.serve_llm import serve_llm


class NavigatorProviderTests(unittest.TestCase):
    def test_provider_selector_only_accepts_navigator(self):
        self.assertIs(serve_llm('navigator'), navigator_llm)
        with self.assertRaises(ValueError):
            serve_llm('chatgpt')
        with self.assertRaises(ValueError):
            serve_llm('claude')

    def test_client_uses_navigator_credentials_and_endpoint(self):
        with patch.dict(os.environ, {'NAVIGATOR_API_KEY': 'test-key'}):
            with patch('src.llm.openai_analysis.openai.OpenAI') as client:
                _create_client()

        client.assert_called_once_with(
            api_key='test-key',
            base_url='https://api.ai.it.ufl.edu/v1',
        )

    def test_models_endpoint_reports_navigator_configuration(self):
        with patch.dict(os.environ, {'NAVIGATOR_API_KEY': 'test-key'}):
            response = app.test_client().get('/models')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {'models': {'navigator': True}})

    def test_nemotron_disables_reasoning_and_detects_truncated_output(self):
        client = Mock()
        client.chat.completions.create.return_value = SimpleNamespace(choices=[
            SimpleNamespace(finish_reason='length', message=SimpleNamespace(content=None))
        ])

        with self.assertRaises(NavigatorError) as error:
            _chat_completion(client, 'Suggest themes', max_tokens=2048)

        self.assertEqual(error.exception.code, 'NAVIGATOR_OUTPUT_TRUNCATED')
        client.chat.completions.create.assert_called_once_with(
            model='nemotron-3-super-120b-a12b',
            messages=[{'role': 'user', 'content': 'Suggest themes'}],
            max_tokens=2048,
            extra_body={'chat_template_kwargs': {'enable_thinking': False}},
        )

    def test_theme_route_exposes_actionable_navigator_error(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(routes, 'DATABASE', os.path.join(directory, 'sessions.db')):
                routes.init_db()
                session_id = routes.create_session()
                model = Mock()
                model.suggest_themes.side_effect = NavigatorError(
                    'NaviGator ran out of output space. Please retry.',
                    'NAVIGATOR_OUTPUT_TRUNCATED',
                )
                with patch.object(routes, 'get_model', return_value=model):
                    response = app.test_client().post(
                        f'/session/{session_id}/suggest-themes',
                        json={'specBool': 'true', 'response': ['An example answer']},
                    )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json(), {
            'error': 'NaviGator ran out of output space. Please retry.',
            'code': 'NAVIGATOR_OUTPUT_TRUNCATED',
            'retryable': True,
        })

    def test_classification_retries_incomplete_json(self):
        incomplete = '{"classifications": [{"response_num": 1, "themes": ["Helpful"]}]}'
        complete = ('{"classifications": ['
                    '{"response_num": 1, "themes": ["Helpful"]},'
                    '{"response_num": 2, "themes": []}]}')
        with patch('src.llm.openai_analysis._create_client'):
            with patch('src.llm.openai_analysis._chat_completion', side_effect=[incomplete, complete]) as completion:
                result = navigator_llm.classify_responses_by_themes(
                    ['First response', 'Second response'],
                    [{'name': 'Helpful', 'description': 'Helps learning'}],
                )

        self.assertEqual(result, {'Helpful': [0], 'Unclassified': [1]})
        self.assertEqual(completion.call_count, 2)
        self.assertEqual(completion.call_args.kwargs['response_format'], {'type': 'json_object'})

    def test_classification_rejects_missing_responses_after_retry(self):
        incomplete = '{"classifications": [{"response_num": 1, "themes": []}]}'
        with patch('src.llm.openai_analysis._create_client'):
            with patch('src.llm.openai_analysis._chat_completion', return_value=incomplete) as completion:
                with self.assertRaises(NavigatorError) as error:
                    navigator_llm.classify_responses_by_themes(
                        ['First response', 'Second response'],
                        [{'name': 'Helpful', 'description': 'Helps learning'}],
                    )

        self.assertEqual(error.exception.code, 'NAVIGATOR_INVALID_OUTPUT')
        self.assertEqual(completion.call_count, 2)


if __name__ == '__main__':
    unittest.main()
