// Keep the study and imported-file journeys explicit without sending study coders
// back to the published study editor as though they need to upload data again.
export function analysisNavigation(source, currentStep) {
  const parent = source ? `/studies/${source.studyId}?${new URLSearchParams({section:'analysis',version:source.versionId})}` : '/';
  const paths = source
    ? ['code','review','results'].map(step=>`/studies/${source.studyId}/questions/${source.questionId}/${step}?${new URLSearchParams({version:source.versionId})}`)
    : ['/upload','/code','/review','/results'];
  const labels = source ? ['Code examples','Review coding','Findings'] : ['Import data','Code examples','Review coding','Findings'];
  const index = Math.max(0,Math.min(labels.length-1,currentStep-(source?2:1)));
  return {steps:labels.map((label,i)=>({label,path:paths[i]})),index,
    back:index>0?paths[index-1]:parent,
    backLabel:index>0?`Back to ${labels[index-1].toLowerCase()}`:source?'Back to question list':'Back to studies'};
}

export function analysisTask(item) {
  if(!item.count)return {kind:'collect',label:'Collect responses',detail:'Responses are needed before coding this question.'};
  if(item.analysis&&item.analysis.stage!=='results')return {kind:'resume',label:item.analysis.stage==='review'?'Continue review':'Continue coding',detail:item.analysis.stage==='review'?'Review the saved theme assignments.':'Continue your saved examples and codebook.'};
  if(item.runs.length&&!item.needsWork)return {kind:'findings',label:'Open findings',detail:'The completed analysis is ready to inspect and report.'};
  return {kind:'start',label:item.newCount>0?'Analyze new responses':'Start coding',detail:item.newCount>0?`${item.newCount} new responses. Earlier findings stay saved when you start another analysis.`:'Define themes, code examples, then review the suggested assignments.'};
}

export function findingsTabUrl(source, search, tab, theme) {
  const params=new URLSearchParams(search);
  if(source&&!params.has('version'))params.set('version',source.versionId);
  if(tab==='summary')params.delete('tab');else params.set('tab',tab);
  if(tab==='themes' && theme)params.set('theme',theme);else params.delete('theme');
  const pathname=source?`/studies/${source.studyId}/questions/${source.questionId}/results`:'/results';
  return pathname+(params.size?`?${params}`:'');
}
