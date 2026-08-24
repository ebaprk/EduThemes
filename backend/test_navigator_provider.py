import os
import unittest
from unittest.mock import patch

from app import app
from src.llm.openai_analysis import _create_client, navigator_llm
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


if __name__ == '__main__':
    unittest.main()
