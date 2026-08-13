import random

import pandas as pd


RESPONSE_COLUMN_NAMES = ('Response', 'Responses')
THEME_COLUMN_NAMES = ('Themes', 'Theme')


def _find_column(dataframe, exact_names, keywords, fallback_to_first=False):
    for name in exact_names:
        if name in dataframe.columns:
            return name, dataframe[name]
    for column in dataframe.columns:
        if any(keyword in str(column).lower() for keyword in keywords):
            return str(column), dataframe[column]
    if fallback_to_first and len(dataframe.columns) > 0:
        return str(dataframe.columns[0]), dataframe.iloc[:, 0]
    return None, None


def preprocess_dataframe(dataframe, colors):
    response_name, responses = _find_column(
        dataframe,
        RESPONSE_COLUMN_NAMES,
        ('response', 'answer', 'text'),
        fallback_to_first=True,
    )
    theme_name, themes = _find_column(
        dataframe,
        THEME_COLUMN_NAMES,
        ('theme', 'category', 'tag'),
    )

    if responses is None or len(responses) == 0:
        raise ValueError('No responses found in the uploaded file.')

    valid_mask = responses.notna() & responses.astype(str).str.strip().ne('')
    valid_indices = dataframe.index[valid_mask].tolist()
    if not valid_indices:
        raise ValueError('No non-empty responses were found in the uploaded file.')

    predefined_themes = []
    if themes is not None:
        for value in themes.loc[valid_indices].dropna().astype(str).unique():
            cleaned_name = value.strip()
            if cleaned_name and cleaned_name.lower() != 'none':
                predefined_themes.append({
                    'name': cleaned_name,
                    'description': f'Theme: {cleaned_name}',
                    'color': random.choice(colors),
                })

    themes_by_name = {theme['name']: theme for theme in predefined_themes}
    preprocessed = []
    for row_index in valid_indices:
        response = str(responses.loc[row_index])
        row_themes = []
        if themes is not None and pd.notna(themes.loc[row_index]):
            assigned_name = str(themes.loc[row_index]).strip()
            if assigned_name in themes_by_name:
                row_themes.append(themes_by_name[assigned_name])
        preprocessed.append({
            'original': response,
            'cleaned': response.strip(),
            'themes': row_themes,
        })

    summary = {
        'response_count': len(preprocessed),
        'blank_rows_skipped': int((~valid_mask).sum()),
        'response_column': response_name,
        'theme_column': theme_name,
        'predefined_theme_count': len(predefined_themes),
    }
    return preprocessed, predefined_themes, summary
