const sorted = themes => [...new Set(themes || [])].sort();
const same = (a,b) => JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const md = value => String(value ?? '').replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
export function responseComparison(context) {
  if (!['comparison','finalized'].includes(context?.round?.state)) return [];
  return context.round.responses.map(response=>{
    const votes=context.assignments.filter(a=>a.response_ids.includes(response.id)&&a.submitted_at&&a.ballot?.[response.id]).map(a=>({coder_id:a.coder_id,...a.ballot[response.id]}));
    const disagreement=votes.length>1&&votes.some(vote=>!same(vote.themes,votes[0].themes));
    const decision=context.decisions.find(d=>d.response_id===response.id);
    return {...response,votes,disagreement,decision,finalThemes:decision?.themes || (!disagreement&&votes.length?votes[0].themes:null)};
  });
}
export function codingAgreement(context) {
  const rows=responseComparison(context), shared=rows.filter(row=>row.votes.length>=2);
  let pairs=0,matches=0;
  const themes=(context?.round?.codebook || []).map(theme=>({name:theme.name,matches:0,pairs:0}));
  for(const row of shared)for(let i=0;i<row.votes.length;i++)for(let j=i+1;j<row.votes.length;j++){
    pairs++;if(same(row.votes[i].themes,row.votes[j].themes))matches++;
    for(const theme of themes){theme.pairs++;if(row.votes[i].themes.includes(theme.name)===row.votes[j].themes.includes(theme.name))theme.matches++;}
  }
  return {shared:shared.length,unanimous:shared.filter(row=>!row.disagreement).length,pairs,matches,percent:pairs?100*matches/pairs:null,themes,disagreements:rows.filter(row=>row.disagreement).length,resolved:rows.filter(row=>row.disagreement&&row.decision).length,singleCoded:rows.filter(row=>row.votes.length===1).length};
}
export function codingDecisionDrafts(context) {
  return Object.fromEntries(responseComparison(context).map(row=>[row.id,{themes:row.finalThemes,rationale:row.decision?.rationale || ''}]));
}
export function codingMethods(context) {
  if (!['comparison','finalized'].includes(context?.round?.state)) return 'Coding comparison is not open.';
  const a=codingAgreement(context);
  return `${context.assignments.length} coders submitted separate choices for ${context.round.responses.length} responses using a frozen codebook. ${a.shared} responses were coded by at least two coders; ${a.singleCoded} were coded by one coder. Exact theme-set agreement before adjudication: ${a.pairs?`${a.matches}/${a.pairs} coder-pair comparisons (${a.percent.toFixed(1)}%)`:'not calculated (no shared responses)'}. ${a.resolved}/${a.disagreements} disagreements have a recorded adjudication. Existing study access allowed collaborators to view other study materials. Agreement is descriptive and is not corrected for chance.`;
}
export function codingRoundReport(context) {
  const a=codingAgreement(context), rows=responseComparison(context), r=context.round;
  return [`# Coding round: ${md(r.title)}`,`Status: ${r.state}. Question: ${md(r.prompt)}`,
    `Round: ${r.id} · Study version: ${r.version_id}`,`Created: ${r.created_at} · Comparison opened: ${r.revealed_at || 'Not opened'} · Finalized: ${r.finalized_at || 'Not finalized'}`,
    '## Coding and reconciliation process',codingMethods(context),
    'Missing assignments are excluded from agreement. A completed response with no matching theme is an explicit empty theme set. With more than two coders, each pair sharing a response contributes one comparison. Per-theme agreement counts both joint inclusion and joint exclusion.',
    '## Agreement before adjudication',...a.themes.map(t=>`${md(t.name)}: ${t.pairs?`${t.matches}/${t.pairs} pairs (${(100*t.matches/t.pairs).toFixed(1)}%)`:'Not calculated'}`),
    '## Final coding counts (resolved responses)',...r.codebook.map(t=>`${md(t.name)}: ${rows.filter(row=>row.finalThemes?.includes(t.name)).length}`),`No matching theme: ${rows.filter(row=>Array.isArray(row.finalThemes)&&!row.finalThemes.length).length}`,`Unresolved final decisions: ${rows.filter(row=>row.finalThemes===null).length}`,
    '## Codebook',...r.codebook.flatMap(t=>[`### ${md(t.name)}`,`Definition: ${md(t.description || 'Not recorded')}`,`Include when: ${md(t.include_when || 'Not recorded')}`,`Exclude when: ${md(t.exclude_when || 'Not recorded')}`,`Example: ${md(t.example || 'Not recorded')}`]),
    '## Export boundaries','This report excludes response text, coder notes, email addresses, and adjudication rationales. Inspect the round inside EduThemes to review individual decisions. Only finalized consensus can be applied to a new analysis; earlier findings remain preserved.'
  ].join('\n\n');
}
