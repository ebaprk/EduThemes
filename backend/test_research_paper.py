import copy
import json
import os
import tempfile
import unittest
from unittest.mock import Mock, patch

import httpx
from app import app
import routes
import research_paper as paper
from src.llm.openai_analysis import NavigatorError

STUDY = '20000000-0000-4000-8000-000000000001'
VERSION = '30000000-0000-4000-8000-000000000001'
QUESTION = '40000000-0000-4000-8000-000000000001'
RUN = dict(labels=[dict(name='Planning', description='Clear next steps')], response_count=99,
           coded_responses=[dict(original='A clear plan helped.', themes=[dict(name='Planning')], participant_data={'email': 'private@example.test'}),
                            dict(original='UNSELECTED PRIVATE ANSWER', themes=[]),
                            dict(original='A second plan helped.', themes=[dict(name='Planning'), dict(name='Planning')])],
           results={'summary': 'Planning was helpful in these responses.', 'themes': [{'name': 'Planning', 'frequency': 999}]})
NOTES = dict(methods='Imported course feedback was reviewed by the study researcher.', limitations='This small sample cannot establish causation.', ai_disclosure='AI assisted coding was checked by a researcher.', quotes=[0], flags={'1': {'note': 'PRIVATE REVIEW NOTE', 'resolved': False}})
VERSION_DATA = dict(id=VERSION, study_id=STUDY, title='Advising experiences', description='Course advising feedback.', research_question='What helped students plan?', additional_context='', version_number=1, participant_mode='anonymous', consent_required=True, consent_text='Participation is voluntary.', questions=[dict(id=QUESTION, prompt='What helped you?')])


def manuscript():
    paragraph = ('The recorded findings describe planning within the available response units. '
                 'The interpretation remains limited to the supplied study materials and researcher notes. '
                 'Response counts describe coded units rather than unique people or a representative population. ')
    return {key: (paragraph * 3).strip() for key, _ in paper.SECTIONS}


class ResearchPaperTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db = patch.object(routes, 'DATABASE', os.path.join(self.directory.name, 'sessions.db'))
        self.db.start()
        self.addCleanup(self.db.stop)
        routes.init_db()
        self.client = app.test_client()
        self.data = dict(paper={'target_words': 1800}, sources=[dict(version_id=VERSION, question_id=QUESTION, run_key='run-1', snapshot_hash='hash-1')])
        self.state = dict(snapshot_hash='hash-1', run=copy.deepcopy(RUN), review=copy.deepcopy(NOTES))

    def database(self, path, **kwargs):
        if path == 'study_versions':
            return [VERSION_DATA]
        if path == 'studies':
            return [{'source_type': 'file'}]
        if path == 'rpc/get_study_run_review':
            return self.state
        self.fail(path)

    def test_evidence_uses_actual_coding_and_only_selected_quotes(self):
        evidence = paper.evidence(RUN, NOTES, 'Why?', 1)
        self.assertEqual(evidence['response_units'], 3)
        self.assertEqual(evidence['codebook'][0]['count'], 2)
        self.assertEqual(evidence['selected_quotes'], [{'id': 'S1-R1', 'text': 'A clear plan helped.'}])
        encoded = json.dumps(evidence)
        for private in ['private@example.test', 'PRIVATE REVIEW NOTE', 'UNSELECTED PRIVATE ANSWER', '999']:
            self.assertNotIn(private, encoded)
        self.assertEqual(evidence['unresolved_review_flags'], 1)

    def test_saved_evidence_is_authoritative_and_bound_to_snapshot(self):
        self.data['sources'][0]['run'] = {'results': {'summary': 'CLIENT INVENTION'}}
        with patch.object(paper, 'require_study_access') as access, patch.object(paper, '_database', side_effect=self.database):
            packet = paper.saved_evidence(STUDY, self.data)
        access.assert_called_once_with(STUDY, edit=True)
        self.assertEqual(packet['sources'][0]['response_units'], 3)
        self.assertNotIn('CLIENT INVENTION', json.dumps(packet))
        self.assertNotIn('consent_text', packet['study'])
        self.assertNotIn('participant_mode', packet['study'])

    def test_stale_mixed_and_duplicate_sources_fail_before_model_call(self):
        for sources in [
            [dict(self.data['sources'][0], snapshot_hash='old')],
            self.data['sources'] * 2,
            [self.data['sources'][0], dict(self.data['sources'][0], version_id=STUDY)],
        ]:
            with patch.object(paper, 'require_study_access'), patch.object(paper, '_database', side_effect=self.database), self.assertRaises(paper.PaperError):
                paper.saved_evidence(STUDY, dict(self.data, sources=sources))

    def test_study_endpoint_rejects_anonymous_and_read_only_callers(self):
        with patch.object(paper, 'generate_paper') as generate:
            self.assertEqual(self.client.post(f'/studies/{STUDY}/research-paper', json=self.data).status_code, 401)
            with patch.dict(os.environ, {'SUPABASE_URL': 'https://database.example', 'SUPABASE_PUBLISHABLE_KEY': 'public-key'}):
                response = httpx.Response(200, json='reviewer', request=httpx.Request('POST', 'https://database.example/rest/v1/rpc/study_role'))
                with patch('study_access.httpx.post', return_value=response):
                    result = self.client.post(f'/studies/{STUDY}/research-paper', json=self.data, headers={'Authorization': 'Bearer reviewer'})
            self.assertEqual(result.status_code, 403)
            generate.assert_not_called()

    def test_database_reads_preserve_callers_identity(self):
        response = httpx.Response(200, json=[], request=httpx.Request('GET', 'https://database.example/rest/v1/study_versions'))
        with patch.dict(os.environ, {'SUPABASE_URL': 'https://database.example', 'SUPABASE_PUBLISHABLE_KEY': 'public-key', 'SUPABASE_SERVICE_ROLE_KEY': 'DO NOT IMPERSONATE SERVICE'}):
            with app.test_request_context(headers={'Authorization': 'Bearer caller-jwt'}), patch.object(paper.httpx, 'get', return_value=response) as get:
                paper._database('study_versions', params={'id': 'eq.version'})
        self.assertEqual(get.call_args.kwargs['headers'], {'apikey': 'public-key', 'Authorization': 'Bearer caller-jwt'})

    def test_authorized_saved_run_generates_a_complete_http_response(self):
        with patch.object(paper, 'require_study_access'), patch.object(paper, '_database', side_effect=self.database), patch.object(paper, '_create_client'), patch.object(paper, '_chat_completion', return_value=json.dumps(manuscript())):
            response = self.client.post(f'/studies/{STUDY}/research-paper', json=self.data, headers={'Authorization': 'Bearer researcher'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['source_count'], 1)
        self.assertEqual(response.json['source_units'], [3])
        self.assertIn('## Conclusion', response.json['markdown'])
        self.assertNotIn('UNSELECTED PRIVATE ANSWER', response.json['markdown'])

    def test_generation_has_complete_sections_and_deterministic_evidence(self):
        packet = dict(study={'title': 'Advising study'}, sources=[paper.evidence(RUN, NOTES, 'Why?', 1)])
        settings = paper.options({'target_words': 1800, 'authors': 'Test Author', 'references': ['Test source with researcher-supplied notes.']})
        with patch.object(paper, '_create_client'), patch.object(paper, '_chat_completion', return_value=json.dumps(manuscript())) as completion:
            result = paper.generate_paper(packet, settings)
        for _, heading in paper.SECTIONS:
            self.assertIn(f'## {heading}', result['markdown'])
        self.assertIn('Planning: 2 of 3 response units', result['markdown'])
        self.assertIn('> A clear plan helped.', result['markdown'])
        self.assertIn('[1] Test source', result['markdown'])
        self.assertIn('AI-generated manuscript draft', result['markdown'])
        self.assertIn('Test Author', result['markdown'])
        for private in ['UNSELECTED PRIVATE ANSWER', 'PRIVATE REVIEW NOTE', 'private@example.test']:
            self.assertNotIn(private, completion.call_args.args[1])
            self.assertNotIn(private, result['markdown'])
        self.assertIn('untrusted DATA', completion.call_args.kwargs['system_prompt'])
        self.assertEqual(completion.call_args.kwargs['response_format'], {'type': 'json_object'})

    def test_incomplete_placeholder_and_invented_citation_outputs_retry_then_fail(self):
        invalid = [dict(manuscript(), abstract='Too short.'), dict(manuscript(), methods=manuscript()['methods'] + ' TODO'), dict(manuscript(), discussion=manuscript()['discussion'] + ' [99]'),
                   dict(manuscript(), discussion=manuscript()['discussion'] + ' (Invented, 2020)'),
                   dict(manuscript(), discussion=manuscript()['discussion'] + ' https://invented.invalid/paper'),
                   dict(manuscript(), findings=manuscript()['findings'] + ' “An entirely fabricated participant quotation.”')]
        packet = dict(study={'title': 'Study'}, sources=[paper.evidence(RUN, NOTES, 'Why?', 1)])
        for response in invalid:
            with patch.object(paper, '_create_client'), patch.object(paper, '_chat_completion', return_value=json.dumps(response)) as completion:
                with self.assertRaises(NavigatorError) as error:
                    paper.generate_paper(packet, paper.options({}))
                self.assertEqual(error.exception.code, 'NAVIGATOR_INVALID_PAPER')
                self.assertEqual(completion.call_count, 2)

    def test_truncated_output_can_recover_without_returning_fragments(self):
        packet = dict(study={'title': 'Study'}, sources=[paper.evidence(RUN, NOTES, 'Why?', 1)])
        with patch.object(paper, '_create_client'), patch.object(paper, '_chat_completion', side_effect=[NavigatorError('Too long', 'NAVIGATOR_OUTPUT_TRUNCATED'), json.dumps(manuscript())]):
            self.assertIn('## Conclusion', paper.generate_paper(packet, paper.options({}))['markdown'])

    def test_file_endpoint_retains_session_checks_and_provider_errors(self):
        session = routes.create_session()
        body = dict(paper={}, metadata={'researchQuestion': 'Why?'}, run=RUN, review=NOTES)
        with patch.object(routes, 'generate_paper', side_effect=NavigatorError('Please retry.', 'NAVIGATOR_TIMEOUT', 504)):
            self.assertEqual(self.client.post(f'/session/{session}/research-paper', json=body).status_code, 504)
        self.assertEqual(self.client.post('/session/no-session/research-paper', json=body).status_code, 410)
        with patch.object(routes, 'generate_paper', return_value={'markdown': 'A complete draft.'}):
            self.assertEqual(self.client.post(f'/session/{session}/research-paper', json=body).json['markdown'], 'A complete draft.')

    def test_input_validation_handles_malformed_rows_quotes_and_settings(self):
        for run, notes in [(dict(RUN, coded_responses=[None]), NOTES), (RUN, dict(NOTES, quotes=[True])), (RUN, dict(NOTES, quotes=[99])), (RUN, dict(NOTES, flags=[]))]:
            with self.assertRaises(paper.PaperError):
                paper.evidence(run, notes, 'Why?', 1)
        for settings in [None, {'target_words': True}, {'target_words': 100000}, {'references': ['x' * 3001]}]:
            with self.assertRaises(paper.PaperError):
                paper.options(settings)
        self.assertEqual(self.client.post(f'/studies/{STUDY}/research-paper', json=[]).status_code, 400)

    def test_reliability_uses_original_ballots_and_keeps_undefined_kappa(self):
        context = dict(round=dict(state='finalized', responses=[{'id': 'r1'}, {'id': 'r2'}], codebook=[{'name': 'A'}, {'name': 'Constant'}]),
                       assignments=[dict(coder_id='private1', submitted_at='now', response_ids=['r1', 'r2'], ballot={'r1': {'themes': ['A', 'Constant'], 'note': 'PRIVATE'}, 'r2': {'themes': ['Constant']}}),
                                    dict(coder_id='private2', submitted_at='now', response_ids=['r1', 'r2'], ballot={'r1': {'themes': ['A', 'Constant']}, 'r2': {'themes': ['Constant']}})], decisions=[])
        result = paper.reliability(context)
        self.assertEqual(result[0]['themes'][0]['kappa'], 1)
        self.assertIsNone(result[0]['themes'][1]['kappa'])
        self.assertNotIn('private', json.dumps(result))
        self.assertEqual(paper.reliability(dict(context, round=dict(context['round'], state='independent'))), [])


if __name__ == '__main__':
    unittest.main()
