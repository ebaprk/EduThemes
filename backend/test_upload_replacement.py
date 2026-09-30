import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from app import app
import routes


class UploadReplacementTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database_patch = patch.object(
            routes, 'DATABASE', os.path.join(self.directory.name, 'sessions.db')
        )
        self.upload_patch = patch.object(routes, 'UPLOAD_FOLDER', self.directory.name)
        self.database_patch.start()
        self.upload_patch.start()
        self.addCleanup(self.database_patch.stop)
        self.addCleanup(self.upload_patch.stop)
        routes.init_db()
        self.session_id = routes.create_session()
        self.client = app.test_client()

    def upload(self, csv):
        return self.client.post(
            f'/session/{self.session_id}/upload-dataset',
            data={
                'dataset': (io.BytesIO(csv.encode()), 'responses.csv'),
                'researchQuestion': 'What helps students learn?',
                'projectDescription': 'A classroom study',
                'apiKey': 'navigator',
            },
        )

    def test_failed_replacement_preserves_dataset_and_success_clears_old_results(self):
        first = self.upload('Response,Theme\nFirst answer,Helpful feedback\n')
        self.assertEqual(first.status_code, 200)
        original_path = routes.get_session(self.session_id)['dataset_path']
        self.assertTrue(os.path.exists(original_path))

        final_path = os.path.join(self.directory.name, f'{self.session_id}_final_dataset.json')
        summary_path = os.path.join(self.directory.name, f'{self.session_id}_summary.txt')
        with open(final_path, 'w') as artifact:
            json.dump([{'original': 'First answer'}], artifact)
        with open(summary_path, 'w') as artifact:
            artifact.write('old result')
        manual_path = os.path.join(self.directory.name, f'{self.session_id}_manual_coding.json')
        with open(manual_path, 'w') as artifact:
            json.dump({'0': 'Helpful feedback'}, artifact)
        routes.update_session(
            self.session_id,
            manual_coding=manual_path,
            analysis_results=json.dumps({'summary': 'old result'}),
            status='FINAL_DATASET_SUBMITTED',
        )

        invalid = self.upload('Response,Theme\n,\n')
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(routes.get_session(self.session_id)['dataset_path'], original_path)
        with open(original_path) as dataset:
            self.assertIn('First answer', dataset.read())
        self.assertEqual(
            self.client.get(f'/session/{self.session_id}/download-final-dataset').status_code,
            200,
        )

        replacement = self.upload('Response\nSecond answer\n')
        self.assertEqual(replacement.status_code, 200)
        session = routes.get_session(self.session_id)
        self.assertNotEqual(session['dataset_path'], original_path)
        self.assertFalse(os.path.exists(original_path))
        self.assertEqual(json.loads(session['labels']), [])
        self.assertIsNone(session['manual_coding'])
        self.assertIsNone(session['analysis_results'])
        self.assertFalse(os.path.exists(manual_path))
        self.assertFalse(os.path.exists(final_path))
        self.assertFalse(os.path.exists(summary_path))
        self.assertEqual(
            self.client.get(f'/session/{self.session_id}/download-final-dataset').status_code,
            404,
        )


if __name__ == '__main__':
    unittest.main()
