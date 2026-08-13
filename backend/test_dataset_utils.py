import unittest

import pandas as pd

from dataset_utils import preprocess_dataframe


class PreprocessDataframeTests(unittest.TestCase):
    def test_blank_response_rows_do_not_shift_theme_assignments(self):
        dataframe = pd.DataFrame({
            'Response': ['First', None, 'Third'],
            'Theme': ['Alpha', 'Wrong row', 'Gamma'],
        })

        dataset, themes, summary = preprocess_dataframe(dataframe, ['#123456'])

        self.assertEqual([entry['original'] for entry in dataset], ['First', 'Third'])
        self.assertEqual([entry['themes'][0]['name'] for entry in dataset], ['Alpha', 'Gamma'])
        self.assertEqual(summary['blank_rows_skipped'], 1)
        self.assertNotIn('Wrong row', [theme['name'] for theme in themes])

    def test_theme_colors_are_valid_hex_values(self):
        dataframe = pd.DataFrame({'Response': ['One'], 'Theme': ['Alpha']})
        dataset, themes, _summary = preprocess_dataframe(dataframe, ['#abcdef'])

        self.assertEqual(themes[0]['color'], '#abcdef')
        self.assertEqual(dataset[0]['themes'][0]['color'], '#abcdef')


if __name__ == '__main__':
    unittest.main()
