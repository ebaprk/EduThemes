export function paperReview(value = {}) {
  return {
    methods: value.methods || '', limitations: value.limitations || '', ai_disclosure: value.ai_disclosure || '',
    quotes: [...new Set(value.quotes || [])].sort((a, b) => a - b),
    // Only a flag count is needed for drafting; private uncertainty notes stay out.
    flags: Object.fromEntries(Object.entries(value.flags || {}).map(([key, flag]) => [key, { note: flag.note ? 'Flag recorded' : '', resolved: Boolean(flag.resolved) }]))
  };
}

export function paperSettings(value) {
  const references = value.references.split(/\n\s*\n/).map(reference => reference.trim()).filter(Boolean);
  if (references.length > 20) throw new Error('Use up to 20 references, separated by blank lines.');
  if (references.some(reference => reference.length > 3000)) throw new Error('Keep each reference and its source notes within 3,000 characters.');
  return { title: value.title.trim(), authors: value.authors.trim(), affiliation: value.affiliation.trim(), target_words: Number(value.target_words), references };
}

export function readPaperDraft(storage, key) {
  try {
    const record = JSON.parse(storage.getItem(key) || 'null');
    if (record?.version !== 1 || typeof record.draft?.markdown !== 'string' || record.draft.markdown.length > 500000) return null;
    return record;
  } catch { return null; }
}

export function paperFingerprint(evidence, settings) {
  return JSON.stringify({ evidence, settings });
}
