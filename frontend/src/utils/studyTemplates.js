const activity = (title, questions, kind='survey', day=0) => ({title,questions,kind,required:true,instructions:'',opens_after_days:day,due_after_days:null});
export const studyTemplates = [
  {id:'reflection',name:'Student reflection',description:'One activity about an experience, what helped, and what could improve.',form:{title:'Student experience reflection',research_question:'How do students describe their learning experience?',description:'Share your perspective in a short written reflection.',activities:[activity('Reflection',['Describe a recent learning experience.','What helped you, and what could improve?'])]}},
  {id:'interview',name:'Written interview',description:'A structured set of open questions with space for detailed answers.',form:{title:'Written interview',research_question:'How do participants experience this topic?',description:'Answer open questions at your own pace. Review your answers before submitting.',activities:[activity('Interview',['Tell us about your experience with this topic.','Describe a specific example.','What would you want the study team to understand?'])]}},
  {id:'followup',name:'Baseline and follow-up',description:'Two linked activities, with a follow-up opening after seven days.',form:{title:'Experience over time',research_question:'How do participants describe changes in their experience over time?',description:'Complete an initial reflection and return for a follow-up after seven days.',activities:[activity('Baseline',['Describe your experience so far.','What do you hope will change?'],'baseline'),activity('Follow-up',['What has changed since your first reflection?','What helped or got in the way?'],'followup',7)]}},
];
export function templateForm(value) {
  if (!value || !Array.isArray(value.activities) || !value.activities.length || value.activities.length>12) throw new Error('Choose an EduThemes study template with 1–12 activities.');
  const fields=['title','research_question','description','additional_context','contact_info','compensation_details'];
  return {...Object.fromEntries(fields.map(key=>[key,String(value[key] || '').slice(0,20000)])),
    // Consent and recruitment are always configured for the new study.
    consent_text:'',participant_mode:'anonymous',recruitment:{enabled:false,questions:[]},
    activities:value.activities.map((item,index)=>{
      if (!Array.isArray(item.questions)||!item.questions.length||item.questions.length>12)throw new Error('Every activity needs 1–12 questions.');
      return {title:String(item.title || `Activity ${index+1}`).slice(0,160),instructions:String(item.instructions || '').slice(0,10000),kind:['survey','baseline','followup','diary'].includes(item.kind)?item.kind:'survey',required:item.required!==false,opens_after_days:index?Math.max(0,Math.min(365,Number(item.opens_after_days)||0)):0,due_after_days:null,questions:item.questions.map(q=>String(typeof q==='string'?q:q.prompt || '').slice(0,2000))};
    })};
}
export function templateFile(form) {
  return JSON.stringify({format:'eduthemes-study-template',version:1,study:templateForm(form)},null,2);
}
