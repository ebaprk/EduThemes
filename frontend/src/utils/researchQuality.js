export const codebookFields = [
  ['description', 'Definition', 200], ['include_when', 'Include when', 1000],
  ['exclude_when', 'Exclude when', 1000], ['example', 'Example (use fabricated text)', 1000],
];
export function cleanCodebook(value) {
  const input = Array.isArray(value) ? value : value?.themes;
  if (!Array.isArray(input) || !input.length || input.length > 10) throw new Error('Choose a codebook with 1–10 themes.');
  const names = new Set();
  return input.map(theme => {
    const name = String(theme.name || '').trim();
    if (!name || name.length > 30 || name.toLowerCase() === 'unclassified' || names.has(name.toLowerCase())) throw new Error('Use unique theme names of up to 30 characters; Unclassified is reserved.');
    names.add(name.toLowerCase());
    const fields = Object.fromEntries(codebookFields.map(([key,,limit]) => {
      const text = String(theme[key] || '').trim();
      if (text.length > limit) throw new Error(`${name}: ${key.replaceAll('_',' ')} is too long.`);
      return [key,text];
    }));
    return {name,...fields,color:/^#[\da-f]{6}$/i.test(theme.color) ? theme.color : '#176b52'};
  });
}
export const codebookFile = labels => JSON.stringify({format:'eduthemes-codebook',version:1,themes:cleanCodebook(labels.filter(t=>t.name!=='Unclassified'))},null,2);
export function downloadText(text,name,type='text/plain') {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url);
}
export const emptyReview = () => ({methods:'',limitations:'',ai_disclosure:'',flags:{},quotes:[],status:'draft'});
export function reviewReady(review) {
  return ['methods','limitations','ai_disclosure'].every(key=>review[key]?.trim())
    && !Object.values(review.flags || {}).some(flag=>flag.note?.trim()&&!flag.resolved);
}
const md = value => String(value ?? '').replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
export function researchBrief(snapshot,question,run,reviewState) {
  const review=reviewState?.review || emptyReview(), approved=reviewState?.current && review.status==='approved';
  const rows=run.coded_responses || [], labels=run.labels || [];
  return [`# ${md(snapshot.title || 'Research brief')}`,
    `Study version: ${snapshot.version_number || 'Not recorded'} · Saved run: ${md(run.results?._run_id || 'Legacy run')}`,
    `Review status: ${approved ? `Reviewed by ${md(review.signed_by)} on ${md(review.signed_at)}` : 'DRAFT — not signed off for this snapshot'}`,
    '## Study purpose',md(snapshot.research_question),`Question: ${md(question.prompt)}`,
    '## Methods',md(review.methods || 'Not documented.'),
    `Participation: ${snapshot.participant_mode === 'canvas' ? 'Canvas identity' : 'Anonymous / private study link'}. Responses in this saved run: ${run.response_count || rows.length}. This is a submission count, not a count of unique people.`,
    `Consent version: ${snapshot.version_number || 'Not recorded'}. Consent required: ${snapshot.consent_required===false?'No (legacy study)':'Yes'}.`,
    '### Consent language',md(snapshot.consent_text || 'No consent language recorded for this version.'),
    '## Findings',run.results?.summary || 'No summary recorded.',
    '### Theme counts',...(run.results?.themes || []).map(theme=>`${md(theme.name)}: ${theme.frequency || 0}`),
    'A response can belong to multiple themes. Counts do not establish causation or representativeness.',
    '## Selected supporting quotes',...(review.quotes?.length ? review.quotes.filter(index=>Number.isInteger(index)&&rows[index]).map(index=>`> ${String(rows[index].original || '').split('\n').map(md).join('\n> ')}\n\nResponse ${index+1} in this saved run.`) : ['No quotes selected.']),
    '## Limitations',md(review.limitations || 'Not documented.'),
    '## AI assistance and human review',md(review.ai_disclosure || 'Not documented; do not assume a model or review process.'),
    '## Codebook appendix',...labels.filter(label=>label.name!=='Unclassified').flatMap(label=>[
      `### ${md(label.name)}`,...codebookFields.map(([key,title])=>`${title}: ${md(label[key] || 'Not recorded')}`)]),
    '## Sharing note','Only explicitly selected response quotes are included. Review quotes and generated summaries for identifying details before sharing. Screening answers, participant identifiers, and private review flags are not included.'
  ].join('\n\n');
}
