const cloneClassifications = (classifications = {}) => Object.fromEntries(
  Object.entries(classifications).map(([name, indices]) => [name, [...(indices || [])]])
);

export function reviewedDataset({ classifications, dataset, labels }) {
  const themesByResponse = dataset.map(() => []);
  const unclassified = labels.find(theme => theme.name === 'Unclassified');

  for (const theme of labels) {
    if (theme.name === 'Unclassified') continue;
    for (const index of new Set(classifications[theme.name] || [])) {
      const entry = dataset[index];
      if (entry?.review_decisions?.[theme.name]?.action !== 'approve') continue;
      const existing = entry.themes?.find(item => item.name === theme.name);
      themesByResponse[index].push(existing || {
        name: theme.name,
        color: theme.color,
        description: theme.description || '',
      });
    }
  }

  return dataset.map((entry, index) => ({
    ...entry,
    themes: themesByResponse[index].length || !unclassified ? themesByResponse[index] : [unclassified],
  }));
}

export function classificationsFromDataset(dataset, labels) {
  const classifications = Object.fromEntries(labels.map(theme => [theme.name, []]));
  dataset.forEach((entry, index) => {
    for (const name of new Set((entry.themes || []).map(theme => theme.name))) {
      if (Object.hasOwn(classifications, name)) classifications[name].push(index);
    }
  });
  return classifications;
}

export const addThemeAssignment = ({ classifications, dataset, theme, responseIndex }) => {
  if (!theme?.name || theme.name === 'Unclassified' || !dataset?.[responseIndex]) {
    return { classifications, dataset };
  }

  const nextClassifications = cloneClassifications(classifications);
  if (!(nextClassifications[theme.name] || []).includes(responseIndex)) {
    nextClassifications[theme.name] = [...(nextClassifications[theme.name] || []), responseIndex];
  }
  nextClassifications.Unclassified = (nextClassifications.Unclassified || [])
    .filter((index) => index !== responseIndex);

  const nextDataset = dataset.map((entry, index) => index === responseIndex
    ? (() => {
        const existingThemes = (entry.themes || []).filter((item) => item.name !== 'Unclassified');
        return {
          ...entry,
          themes: existingThemes.some((item) => item.name === theme.name)
            ? existingThemes
            : [...existingThemes, { ...theme }],
        };
      })()
    : entry);

  return { classifications: nextClassifications, dataset: nextDataset };
};

export const removeThemeAssignment = ({ classifications, dataset, themeName, responseIndex }) => ({
  classifications: {
    ...cloneClassifications(classifications),
    [themeName]: (classifications?.[themeName] || []).filter((index) => index !== responseIndex),
  },
  dataset: dataset.map((entry, index) => index === responseIndex
    ? { ...entry, themes: (entry.themes || []).filter((theme) => theme.name !== themeName) }
    : entry),
});

export const rejectThemeAssignments = ({
  classifications,
  dataset,
  rejectedIndices,
  themeName,
  unclassifiedTheme,
}) => {
  const nextClassifications = cloneClassifications(classifications);
  nextClassifications[themeName] = (nextClassifications[themeName] || [])
    .filter((index) => !rejectedIndices.includes(index));

  rejectedIndices.forEach((responseIndex) => {
    const hasAnotherTheme = Object.entries(nextClassifications).some(([name, indices]) => (
      name !== themeName && name !== 'Unclassified' && indices.includes(responseIndex)
    ));
    if (!hasAnotherTheme && !(nextClassifications.Unclassified || []).includes(responseIndex)) {
      nextClassifications.Unclassified = [...(nextClassifications.Unclassified || []), responseIndex];
    }
  });

  const nextDataset = dataset.map((entry, index) => {
    if (!rejectedIndices.includes(index)) return entry;
    const remainingThemes = (entry.themes || []).filter((theme) => theme.name !== themeName);
    const shouldBeUnclassified = (nextClassifications.Unclassified || []).includes(index)
      && remainingThemes.length === 0;
    return {
      ...entry,
      themes: shouldBeUnclassified ? [{ ...unclassifiedTheme }] : remainingThemes,
    };
  });

  return { classifications: nextClassifications, dataset: nextDataset };
};
