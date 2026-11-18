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
export function codingReliabilityPairs(context) {
  if (!['comparison','finalized'].includes(context?.round?.state)) return [];
  const coders=(context.assignments || []).filter(a=>a.submitted_at);
  return coders.flatMap((a,i)=>coders.slice(i+1).map(b=>[a.coder_id,b.coder_id]));
}
export function codingReliability(context,pair=codingReliabilityPairs(context)[0]) {
  if (!codingReliabilityPairs(context).some(ids=>ids[0]===pair?.[0]&&ids[1]===pair?.[1])) return null;
  const coders=pair.map(id=>context.assignments.find(a=>a.coder_id===id));
  const shared=context.round.responses.filter(row=>coders.every(a=>a.response_ids.includes(row.id)&&Array.isArray(a.ballot?.[row.id]?.themes)));
  const themes=context.round.codebook.map(theme=>{
    let both=0,firstOnly=0,secondOnly=0,neither=0;
    for(const row of shared){
      const [a,b]=coders.map(coder=>coder.ballot[row.id].themes.includes(theme.name));
      if(a&&b)both++;else if(a)firstOnly++;else if(b)secondOnly++;else neither++;
    }
    const n=shared.length, matches=both+neither, firstIncluded=both+firstOnly, secondIncluded=both+secondOnly;
    const expectedNumerator=firstIncluded*secondIncluded+(n-firstIncluded)*(n-secondIncluded);
    const denominator=n*n-expectedNumerator;
    return {name:theme.name,n,matches,firstIncluded,secondIncluded,both,firstOnly,secondOnly,neither,
      observed:n?matches/n:null,expected:n?expectedNumerator/(n*n):null,
      kappa:n&&denominator?(matches*n-expectedNumerator)/denominator:null,
      unavailable:!n?'No shared coded responses':!denominator?'No variation in either coder’s choices':null};
  });
  return {pair,coders:coders.map(a=>({id:a.coder_id,label:`Coder ${context.assignments.indexOf(a)+1}`})),shared:shared.length,themes};
}
export function codingReliabilityReport(context,format='table') {
  const pairs=codingReliabilityPairs(context);
  if(!pairs.length)return 'Cohen’s kappa requires two submitted coders with shared responses. No eligible coder pair is available.';
  return ['Cohen’s kappa is calculated separately for each theme and each fixed pair of human coders, using original submitted choices before adjudication. No pooled or overall multilabel kappa is claimed. Agreement does not establish interpretive validity.',
    ...pairs.flatMap(pair=>{
      const r=codingReliability(context,pair);
      return [`### ${r.coders.map(c=>c.label).join(' and ')} · ${r.shared} shared responses`,
        format==='list'?r.themes.map(t=>`- ${md(t.name)}: kappa ${t.kappa===null?`not calculated (${t.unavailable})`:t.kappa.toFixed(3)}; observed agreement ${t.n?`${t.matches}/${t.n} (${(100*t.observed).toFixed(1)}%)`:'not calculated (no overlap)'}; ${r.coders[0].label} includes ${t.firstIncluded}/${t.n}; ${r.coders[1].label} includes ${t.secondIncluded}/${t.n}.`).join('\n'):
        ['| Theme | Kappa | Observed agreement | First coder includes | Second coder includes |',
        '| --- | --- | --- | --- | --- |',
        ...r.themes.map(t=>`| ${md(t.name)} | ${t.kappa===null?`Not calculated: ${t.unavailable}`:t.kappa.toFixed(3)} | ${t.n?`${t.matches}/${t.n} (${(100*t.observed).toFixed(1)}%)`:'No overlap'} | ${t.firstIncluded}/${t.n} | ${t.secondIncluded}/${t.n} |`)].join('\n'),
        'Expected agreement uses each coder’s inclusion/exclusion frequencies on these shared responses. Explicit no-match coding is included; missing coding is excluded. A constant identical choice makes kappa undefined, even with perfect observed agreement.']
    })].join('\n\n');
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
    '## Chance corrected agreement',codingReliabilityReport(context),
    '## Final coding counts (resolved responses)',...r.codebook.map(t=>`${md(t.name)}: ${rows.filter(row=>row.finalThemes?.includes(t.name)).length}`),`No matching theme: ${rows.filter(row=>Array.isArray(row.finalThemes)&&!row.finalThemes.length).length}`,`Unresolved final decisions: ${rows.filter(row=>row.finalThemes===null).length}`,
    '## Codebook',...r.codebook.flatMap(t=>[`### ${md(t.name)}`,`Definition: ${md(t.description || 'Not recorded')}`,`Include when: ${md(t.include_when || 'Not recorded')}`,`Exclude when: ${md(t.exclude_when || 'Not recorded')}`,`Example: ${md(t.example || 'Not recorded')}`]),
    '## Export boundaries','This report excludes response text, coder notes, email addresses, and adjudication rationales. Inspect the round inside EduThemes to review individual decisions. Only finalized consensus can be applied to a new analysis; earlier findings remain preserved.'
  ].join('\n\n');
}
