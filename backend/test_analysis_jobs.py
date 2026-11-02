import unittest
from unittest.mock import Mock, patch
import analysis_jobs

class AnalysisJobTests(unittest.TestCase):
    def job(self, kind='classify'):
        return dict(id='job',lease_token='fence',kind=kind,payload=dict(dataset=[{'original':'A','themes':[{'name':'Help'}]},{'original':'B','themes':[]}],labels=[{'name':'Help','color':'#123456'}],researchQuestion='Why?'))

    def test_classification_uses_frozen_manual_examples_without_session_files(self):
        model=Mock(); model.classify_responses_by_themes.return_value={'Help':[0]}
        with patch.object(analysis_jobs,'serve_llm',return_value=model):
            result=analysis_jobs.process(self.job())
        self.assertEqual(result['claude_data'],{'Help':[0]})
        args=model.classify_responses_by_themes.call_args.kwargs
        self.assertEqual(args['responses'],['A','B'])
        self.assertEqual(args['manual_codes'],[{'index':0,'themes':[{'name':'Help'}]}])

    def test_findings_counts_and_summary_share_the_reviewed_snapshot(self):
        model=Mock();model.generate_summary.return_value='Evidence'
        with patch.object(analysis_jobs,'serve_llm',return_value=model):
            result=analysis_jobs.process(self.job('findings'))
        self.assertEqual(result,{'themes':[{'name':'Help','color':'#123456','frequency':1}],'summary':'Evidence'})
        self.assertEqual(model.generate_summary.call_args.kwargs['classifications'],{'Help':[0]})

    def test_results_are_fenced_by_claim_token(self):
        with patch.object(analysis_jobs,'process',return_value={'summary':'Saved'}),patch.object(analysis_jobs,'rpc',return_value=True) as rpc:
            analysis_jobs.execute(self.job('findings'))
        self.assertEqual(rpc.call_args.args,('update_analysis_job',dict(p_id='job',p_token='fence',p_status='completed',p_result={'summary':'Saved'})))

    def test_provider_failure_stores_retryable_error_without_private_exception_text(self):
        with patch.object(analysis_jobs,'process',side_effect=RuntimeError('secret')),patch.object(analysis_jobs,'rpc',return_value=True) as rpc:
            analysis_jobs.execute(self.job())
        body=rpc.call_args.args[1]
        self.assertEqual(body['p_status'],'failed');self.assertNotIn('secret',body['p_error'])

    def test_provider_errors_offer_safe_specific_guidance(self):
        from src.llm.openai_analysis import NavigatorError
        with patch.object(analysis_jobs,'process',side_effect=NavigatorError('secret key','NAVIGATOR_AUTH_FAILED')),patch.object(analysis_jobs,'rpc',return_value=True) as rpc:
            analysis_jobs.execute(self.job())
        self.assertIn('rejected its saved credentials',rpc.call_args.args[1]['p_error'])
        self.assertNotIn('secret key',rpc.call_args.args[1]['p_error'])
