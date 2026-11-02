import { completedRuns, runKey } from './analysisHistory.js';

const filled = value => typeof value === 'string' && Boolean(value.trim());
export function findingsUrl(studyId,versionId,questionId,key) {
  return `/studies/${studyId}/questions/${questionId}/results?version=${encodeURIComponent(versionId)}&run=${encodeURIComponent(key)}`;
}
export function resolveStudyView(study,versions,requested,current) {
  const valid=value=>value==='draft'?study.status==='draft':versions.some(version=>version.id===value);
  if(requested&&valid(requested))return requested;
  if(!requested&&current&&valid(current))return current;
  return study.status==='draft'?'draft':study.current_version_id;
}
export function studyActivities(snapshot = {}, questions = []) {
  const plan = snapshot.activities?.length ? snapshot.activities : snapshot.activity_plan;
  if (plan?.length) return plan.map((activity, index) => ({ ...activity, position: index,
    questions: (activity.questions || []).map((question, position) => typeof question === 'string'
      ? { id: `preview-${index}-${position}`, prompt: question, position } : question) }));
  return questions.length ? [{ id:'preview-activity',title:'Study response',kind:'survey',required:true,opens_after_days:0,due_after_days:null,questions }] : [];
}
export function studySnapshot(study, selectedVersion, questions = [], view = 'draft') {
  const source = view === 'draft' ? study : selectedVersion;
  if (!source) return null;
  const snapshot = { ...source, recruitment: view === 'draft' ? source.recruitment_draft || source.recruitment : source.recruitment,
    questions: source.questions || questions, isDraft: view === 'draft' };
  return { ...snapshot, activities: studyActivities(snapshot, snapshot.questions) };
}
export function draftPreview(form) {
  const activities = studyActivities({ activities: form.activities });
  return { ...form, isDraft:true, activities, questions:activities.flatMap(activity=>activity.questions), consent_required:true };
}
export function studyReadiness(snapshot) {
  if (!snapshot) return [];
  const activities=studyActivities(snapshot,snapshot.questions);
  const mode=snapshot.participant_mode;
  const recruitment=snapshot.recruitment || {};
  const validScreening=!recruitment.enabled || (mode==='anonymous' && filled(recruitment.notice) && filled(recruitment.eligibility)
    && filled(recruitment.location) && Number(recruitment.estimated_minutes)>0 && recruitment.questions?.length>0
    && recruitment.questions.every(q=>filled(q.prompt) && q.options?.length>=2 && q.options.every(o=>filled(o.label))));
  return [
    { id:'purpose',title:'Study purpose',detail:'A title and a clear research question.',done:filled(snapshot.title)&&filled(snapshot.research_question),required:true,setup:'design' },
    { id:'activities',title:'Activities and questions',detail:'At least one required activity, with complete questions.',done:activities.length>0&&activities.some(a=>a.required!==false)&&activities.every(a=>filled(a.title)&&a.questions?.length>0&&a.questions.every(q=>filled(q.prompt))),required:true,setup:'activities' },
    { id:'consent',title:'Participant consent',detail:'The consent language participants will review.',done:snapshot.consent_required===false&&!snapshot.isDraft || filled(snapshot.consent_text),required:true,setup:'participation' },
    { id:'identity',title:'Participation and privacy',detail:recruitment.enabled?'Private screening and participation links.':mode==='canvas'?'Verified Canvas identity.':'The identity mode for this study.',done:['anonymous','canvas'].includes(mode)&&!(mode==='canvas'&&(activities.length>1||recruitment.enabled)),required:true,setup:'participation' },
    ...(recruitment.enabled?[{ id:'screening',title:'Screening and eligibility',detail:'Criteria, screening permission, and answer choices.',done:validScreening,required:true,setup:'screening' }]:[]),
    { id:'introduction',title:'Participant introduction',detail:'Explain what taking part involves.',done:filled(snapshot.description),required:false,setup:'design' },
    { id:'contact',title:'Study contact',detail:'Give participants a way to reach the study team.',done:filled(snapshot.contact_info),required:false,setup:'participation' },
  ];
}
export function visiblePreviewQuestions(questions = [], answers = {}) {
  const visible=[],resolved={};
  for(const question of questions) if(!question.show_if || resolved[question.show_if.question_id]===question.show_if.option_id){
    visible.push(question);if(question.options?.some(option=>option.id===answers[question.id]))resolved[question.id]=answers[question.id];
  }
  return visible;
}
export function studyWork(questions = [], responses = [], analyses = []) {
  return questions.map(question=>{
    const analysis=analyses.find(item=>item.question_id===question.id);
    const count=responses.filter(response=>filled(response.answers?.[question.id])).length;
    const runs=completedRuns(analysis);
    const newCount=analysis ? Math.max(0,count-Number(analysis.response_count || 0)) : 0;
    return { question,analysis,count,runs,newCount,needsWork:count>0&&(!analysis||analysis.stage!=='results'||newCount>0) };
  });
}
export function findingsEntries(work) {
  return work.flatMap(item=>item.runs.map((run,index)=>({question:item.question,run,index,key:runKey(run)})));
}
export function nextStudyAction({study,view,role,readiness,work}) {
  const canEdit=['owner','researcher'].includes(role), findings=findingsEntries(work);
  if(!canEdit)return findings.length ? {section:'findings',label:'Review findings',detail:'Open saved results and the evidence behind them.'}
    : {section:work.some(item=>item.count)?'collect':'design',label:work.some(item=>item.count)?'View responses':'View study design',detail:'Your reviewer access lets you inspect the study and its saved work.'};
  if(study.status==='draft'&&view==='draft'){
    const missing=readiness.find(item=>item.required&&!item.done);
    if(missing)return {section:'design',setup:missing.setup,label:'Continue study design',detail:`Next: ${missing.title.toLowerCase()}.`};
    return role==='owner' ? {kind:'publish',label:'Publish study',detail:'The required design and participation information is ready. Preview the participant experience, then publish when you are ready.'}
      : {section:'design',label:'Review study design',detail:'The study is ready for the owner to review and publish.'};
  }
  if(work.some(item=>item.needsWork))return {section:'analysis',label:'Continue analysis',detail:'Code, classify, and review the responses awaiting analysis.'};
  if(findings.length)return {section:'findings',label:'Open findings',detail:'Review completed runs, inspect their evidence, and prepare your research output.'};
  if(study.status==='draft')return {section:'design',label:'View published design',detail:'This is an earlier published version. Switch to Draft to prepare the next version.'};
  if(study.status==='closed')return {section:'settings',label:'Review study closeout',detail:'Collection is closed. Review the team and prepare a new version when needed.'};
  return {section:'collect',label:'Share study',detail:'Share the current participant link, then manage recruitment and incoming responses.'};
}
export function studyReport(snapshot, work) {
  const entries=findingsEntries(work);
  return [`# ${snapshot.title || 'Study findings'}`,`Study version: ${snapshot.version_number || 'Draft'}`,
    `Research question: ${snapshot.research_question || 'Not specified'}`,
    `Participant introduction: ${snapshot.description || 'Not specified'}`,
    `Activities: ${snapshot.activities?.length || 0}`,`Questions: ${work.length}`,
    'This report includes saved findings and coding counts. Structured participant metadata, raw response records, screening answers, and coordinator notes are not added. Generated summary text should be reviewed before sharing.',
    ...entries.flatMap(({question,run,index})=>[ `## ${question.prompt}`,`${index===0?'Latest':'Earlier'} saved run: ${runKey(run)}`,
      `Saved: ${run.updated_at || 'Date not recorded'}`,`Responses in this run: ${run.response_count || 0}`,
      '### Findings',run.results?.summary || 'No summary was saved for this run.',
      '### Theme counts',...(run.results?.themes || []).map(theme=>`${theme.name}: ${theme.frequency || 0}`),
      'Counts describe coded responses; a response can belong to more than one theme. Interpret findings in light of the study design and sample.'
    ])].join('\n\n');
}
