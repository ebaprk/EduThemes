import unittest
from src.llm.openai_analysis import theme_definition


class CodebookTests(unittest.TestCase):
    def test_rules_are_carried_into_classification_context(self):
        text = theme_definition(dict(description='Clear steps', include_when='An explicit plan', exclude_when='General praise', example='A fictional checklist'))
        for expected in ['Clear steps', 'Include when: An explicit plan', 'Exclude when: General praise', 'Illustrative example (not participant data): A fictional checklist']:
            self.assertIn(expected, text)

    def test_legacy_definition_still_works(self):
        self.assertEqual(theme_definition(dict(description='Existing definition')), 'Existing definition')
