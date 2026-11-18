// Production-bundle walkthroughs using synthetic people and intercepted services.
// Database authorization is tested separately against disposable PostgreSQL.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const participantRoot = process.env.PARTICIPANT_PROJECT || path.resolve(root, '../EduThemes-Participant');
const output = path.resolve(root, process.env.UI_AUDIT_OUTPUT || 'frontend/test-results/ui-audit/screens');
await mkdir(output, { recursive: true });
const owner = '10000000-0000-4000-8000-000000000001';
const studyId = '20000000-0000-4000-8000-000000000001';
const versionId = '30000000-0000-4000-8000-000000000001';
const questionId = '40000000-0000-4000-8000-000000000001';
const responseId = '50000000-0000-4000-8000-000000000001';
const code = 'ABCDEF123456';
const env = await readFile(path.join(root, 'frontend/.env.production'), 'utf8');
const supabaseUrl = env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim();
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const user = { id: owner, email: 'owner@ufl.edu', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;

function fixture() {
  const study = { id: studyId, owner_id: owner, title: 'Advising experiences', description: 'Tell us about advising.', research_question: 'What helps students?',
    additional_context: '', consent_text: 'Participation is voluntary. You can leave before submitting. Contact the research team with questions.',
    participant_mode: 'anonymous', status: 'open', current_version_id: versionId, share_code: code, draft_revision: 2, created_at: '2026-10-28T12:00:00Z' };
  const questions = [{ id: questionId, position: 0, prompt: 'What helped you get advising?' }];
  const versions = [{ ...study, id: versionId, study_id: studyId, questions, version_number: 1, consent_required: true, published_at: '2026-10-28T12:00:00Z' }];
  return { study, questions, versions, role: 'owner', members: [], pending: [], calls: [], failSubmission: false,
    responses: [{ id: responseId, study_id: studyId, study_version_id: versionId, answers: { [questionId]: 'A clear appointment link helped.' }, participant_data: {}, consent_accepted_at: '2026-10-28T12:30:00Z' }],
    analyses: [{ study_id: studyId, study_version_id: versionId, question_id: questionId, owner_id: owner, revision: 1, stage: 'results', response_count: 1,
      labels: [{ name: 'Clear guidance', description: 'Knowing what to do next' }], results: { summary: 'Clear instructions helped.', themes: [{ name: 'Clear guidance', frequency: 1 }] },
      coded_responses: [{ original: 'A clear appointment link helped.', submission_id: responseId, study_version_id: versionId, question_id: questionId,
        themes: [{ name: 'Clear guidance' }], review_decisions: { 'Clear guidance': { action: 'approve', recorded_at: '2026-10-28T12:40:00Z' } } }] }],
  };
}
async function serve(directory) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let target = path.resolve(directory, `.${pathname}`);
      if (!target.startsWith(`${directory}${path.sep}`)) target = path.join(directory, 'index.html');
      let body;
      try { body = await readFile(target); } catch { target = path.join(directory, 'index.html'); body = await readFile(target); }
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(target)] || 'application/octet-stream');
      res.end(body);
    } catch { res.writeHead(500); res.end('Test asset unavailable'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const researcherServer = await serve(path.join(root, 'frontend/dist-researcher'));
const participantServer = await serve(process.env.PARTICIPANT_DIST ? path.resolve(process.env.PARTICIPANT_DIST) : path.join(participantRoot, 'dist'));
const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });

const failures=[]; const captures=process.env.SCENARIO?JSON.parse(await readFile(path.join(output,'captures.json'),'utf8').catch(()=>'[]')):[]; const checks=process.env.SCENARIO?JSON.parse(await readFile(path.join(output,'behavior-checks.json'),'utf8').catch(()=>'[]')):[];
async function scenario(name, fn) {
  if (process.env.SCENARIO && !name.includes(process.env.SCENARIO)) return;
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  context.setDefaultTimeout(6000);
  const data = fixture();
  const errors = [];
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if ([researcherServer.url,participantServer.url].includes(url.origin)) return route.continue();
    const request = route.request();
    const reply = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : null;
    if (url.pathname.startsWith('/auth/v1/')) { if(url.pathname.endsWith('/token'))return reply({error:'invalid_grant',error_description:'Email or password is incorrect.'},400); return reply(user); }
    const rpc = url.pathname.split('/rpc/')[1];
    if (rpc) {
      data.calls.push({ rpc, body });
      if(data.rpcDelay?.[rpc])await new Promise(r=>setTimeout(r,data.rpcDelay[rpc]));
      if(data.rpcErrors?.[rpc])return reply({message:data.rpcErrors[rpc]},503);
      if(data.rpcFixtures && rpc in data.rpcFixtures)return reply(data.rpcFixtures[rpc]);
      if (rpc === 'get_study_run_review') return reply({can_edit:data.role==='owner'||data.role==='researcher',current:true,snapshot_hash:'synthetic',review:null,run:data.analyses[0],events:[]});
      if (rpc === 'study_role') return reply(data.role);
      if (rpc === 'pending_study_invitations') return reply(data.pending);
      if (rpc === 'invite_study_member') { data.members.push({ id: 'invitation', study_id: studyId, email: body.p_email, role: body.p_role, created_at: '2026-10-28', accepted_at: null }); return reply('invitation'); }
      if (rpc === 'accept_study_invitation') { data.pending = []; data.role = 'researcher'; return reply(studyId); }
      if (rpc === 'remove_study_member') { data.members = []; return reply(null); }
      if (rpc === 'save_study_draft') { Object.assign(data.study, body.p_form); data.study.draft_revision += 1; data.questions = body.p_form.questions.map((prompt, position) => ({ id: questionId, prompt, position })); return reply(studyId); }
      if (rpc === 'save_study_analysis') {
        if (data.conflictOnSave) return reply({ code: 'PT409', message: 'Another researcher saved this analysis.' }, 409);
        const saved = { ...body.p_snapshot, revision: body.p_expected_revision + 1 };
        data.analyses = [saved]; return reply(saved.revision);
      }
      if (rpc === 'get_public_study' && data.loadDelay) await new Promise((resolve) => setTimeout(resolve, data.loadDelay));
      if (rpc === 'list_coding_rounds' && data.codingRound) return reply([{...data.codingRound.round,coder_count:2,submitted_count:2}]);
      if (rpc === 'get_coding_round' && data.codingRound) return reply(data.codingRound);
      if (rpc === 'get_public_study') return reply({ ...data.versions[0], version_id: data.versions[0].id, ...{ participant_mode: data.study.participant_mode } });
      if (rpc === 'submit_study_version') {
        if (data.submitDelay) await new Promise((resolve) => setTimeout(resolve, data.submitDelay));
        if (data.failSubmission) return reply({ message: 'Connection interrupted. Please try again.', code: 'NETWORK_TEST' }, 503);
        return reply(responseId);
      }
      if (rpc === 'enroll_study') return reply(data.participantStudy);
      if (rpc === 'get_participant_study' || rpc === 'get_participant_portal') return reply(data.participantStudy);
      if (rpc === 'start_study_activity') return reply(data.activityProgress);
      if (rpc === 'save_activity_draft') {
        if (data.saveDelay) await new Promise((resolve) => setTimeout(resolve, data.saveDelay));
        if (data.conflictOnDraft) return reply({ code: 'PT409', message: 'A newer saved draft exists.' }, 409);
        data.activityProgress.draft_answers = body.p_answers;
        data.activityProgress.revision += 1;
        return reply(data.activityProgress.revision);
      }
      if (rpc === 'submit_study_activity') {
        if (data.failSubmission) return reply({ message: 'Connection interrupted. Please try again.', code: 'NETWORK_TEST' }, 503);
        data.participantStudy.activities[0].status = 'completed';
        return reply(responseId);
      }
      if (rpc === 'get_study_receipt') return reply({ submission_id: responseId, title: data.study.title, version_id: versionId, version_number: 1,
        consent_text: data.study.consent_text, consent_accepted_at: '2026-10-28T12:30:00Z' });
      return reply({ message: `Unhandled test RPC: ${rpc}` }, 500);
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').at(-1);
      if(data.tableDelay)await new Promise(r=>setTimeout(r,data.tableDelay));
      if(data.tableErrors?.[table])return reply({message:data.tableErrors[table]},503);
      if(data.tableFixtures && table in data.tableFixtures)return reply(data.tableFixtures[table]);
      if (table === 'studies') {
        if (request.method() === 'PATCH') { Object.assign(data.study, body); return reply([{ id: studyId }]); }
        return reply(request.headers().accept?.includes('vnd.pgrst.object') ? data.study : [data.study]);
      }
      return reply(({ study_questions: data.questions, study_versions: data.versions, study_submissions: data.responses, study_analyses: data.analyses, study_members: data.members })[table] || []);
    }
    if (url.pathname === '/models') return reply({ models: { navigator: true }, background_analysis:Boolean(data.background) });
    if (url.pathname === '/session/start') {data.sessionStarts=(data.sessionStarts||0)+1;return reply({ session_id: 'test-session' });}
    if (url.pathname.endsWith('/submit-manual-coding') && data.classifications) { data.manualCoding=body; return reply({claude_data:data.classifications,svm_data:{}}); }
    if (url.pathname.endsWith('/submit-final-dataset') && data.classifications) { data.finalDataset=body.dataset; return reply({summary:'Fictional findings for testing the review and reporting workflow.',themes:body.labels.map(t=>({...t,frequency:body.dataset.filter(entry=>entry.themes.some(theme=>theme.name===t.name)).length}))}); }
    if (url.pathname.endsWith('/upload-dataset')) { data.uploadAttempts=(data.uploadAttempts||0)+1;if(data.failUpload)return reply({message:'Synthetic import connection interrupted.'},503);return reply({ preprocessed_dataset: [{ original: 'A clear appointment link helped.', cleaned: 'A clear appointment link helped.', themes: [] }], predefined_themes: [], dataset_summary: { response_count: 1 } });}
    if(url.pathname.startsWith('/lti/') && data.canvas)return reply(url.pathname.endsWith('/session')?{participant:data.canvas}:{access_token:'synthetic-canvas',participant:data.canvas});
    if(url.pathname.endsWith('/suggest-themes') && data.suggestions)return reply({suggested_themes:data.suggestions});
    if (url.pathname.startsWith('/session/')) return reply({ status: 'CREATED' });
    return route.abort();
  });
  try {
    const page = await context.newPage();
    await fn({ page, context, data });
    assert.deepEqual(errors, [], 'Browser errors');
    console.log(`PASS ${name}`);
  } catch (error) {
    for (const page of context.pages()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    failures.push({name,error:error.message, pages:await Promise.all(context.pages().map(async p=>({url:p.url().replace(researcherServer.url,'').replace(participantServer.url,''),body:(await p.locator('body').innerText()).slice(0,4000)})))});console.log('FAIL '+name+': '+error.message.slice(0,250));
  } finally { await context.close(); }
}
async function signIn(context, sessionValues = {}) {
  await context.addInitScript(({ key, session, values }) => {
    localStorage.setItem(key, JSON.stringify(session));
    for (const [name, value] of Object.entries(values)) if (!sessionStorage.getItem(name)) sessionStorage.setItem(name, JSON.stringify(value));
  }, { key: storageKey, session: { access_token: token, refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }, values: sessionValues });
}

const themeList=[{name:'Planning',description:'Clear steps and usable information for planning.',color:'#176b52',include_when:'The response describes practical planning guidance.',exclude_when:'Support without a planning component.',example:'A checklist helped me choose courses.'},{name:'Support',description:'Help and encouragement from advisors or peers.',color:'#97543c'}];
function enrich(data){
 data.rpcFixtures={list_coding_rounds:[],list_study_codebooks:[],get_study_recruitment:{target:40,applicants:[]},get_study_operations:{recruitment_target:40,coordinator_notes:'',revision:1,participants:[],unlinked_responses:0},get_study_results_workspace:{draft:null,releases:[],events:[]}};
 data.study.contact_info='Contact the study coordinator at research@example.invalid.';
}
async function capture(page,id,opts={}){
 await page.waitForTimeout(opts.wait??250);
 if(!opts.pending)await page.locator('.edu-loading:visible').first().waitFor({state:'hidden',timeout:4500}).catch(()=>{});
 const widths=opts.widths||[1440,390];
 for(const width of widths){
  await page.setViewportSize({width,height:width>700?1000:844});
  if(!opts.keepScroll)await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(70);
  const metrics=await page.evaluate(()=>{
   const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return !e.closest('[aria-hidden="true"]')&&r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0';};
   const short=e=>(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,110);
   const selector=e=>`${e.tagName.toLowerCase()}${e.id?'#'+e.id:''}${typeof e.className==='string'?'.'+e.className.trim().split(/\s+/).slice(0,2).join('.'):''}`;
   const headings=[...document.querySelectorAll('h1,h2,h3,h4')].filter(visible).map(e=>({text:short(e),tag:e.tagName,font:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight}));
   const controls=[...document.querySelectorAll('button,a,input,select,textarea,summary')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return {name:short(e),selector:selector(e),height:Math.round(r.height),width:Math.round(r.width),disabled:e.disabled||false,font:getComputedStyle(e).fontSize};});
   const overflow=[...document.querySelectorAll('main *, .modal *')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.x< -1||r.right>innerWidth+1;}).map(e=>({selector:selector(e),text:short(e)})).slice(0,20);
   const unlabeled=[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(visible).filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).map(selector);
   return {url:location.pathname+location.search,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,headings,controls,overflow,unlabeled,mainCount:[...document.querySelectorAll('main')].filter(visible).length,bodyText:document.body.innerText.slice(0,25000)};
  });
  const file=`${id}-${width}.png`;
  await page.screenshot({path:path.join(output,file),fullPage:!(await page.getByRole('dialog').isVisible().catch(()=>false)),animations:'disabled'});
  captures.push({id,file,...metrics});
  if(process.env.UI_AUDIT_STRICT_LAYOUT === '1')assert.ok(metrics.scrollWidth<=width+1,`${file}: page width ${metrics.scrollWidth} exceeds viewport ${width}`);
  if(process.env.UI_AUDIT_STRICT_ACCESSIBILITY === '1')assert.deepEqual(metrics.unlabeled,[],`${file}: visible form controls need accessible names`);
 }
 console.log(`CAPTURE ${id}`);
}
const studyPath=(section,query='')=>`${researcherServer.url}/studies/${studyId}?section=${section}&version=${versionId}${query}`;
const values=(stage='code')=>({'eduthemes.sessionId':'audit-file-session','eduthemes.dataset':Array.from({length:12},(_,i)=>({original:i===0?'The course checklist helped me plan and my advisor encouraged me.':i===1?'I struggled to locate an appointment link.':`Fictional advising response ${i+1}: I appreciate practical support when planning my courses.`,cleaned:'Fictional response',themes:i<2?[themeList[i]]:[]})),'eduthemes.labels':themeList,'eduthemes.analysisSource':null,'eduthemes.projectMetadata':{researchQuestion:'What supports student planning?',projectDescription:'A synthetic dataset for interface inspection.'}});

async function assignExampleTheme(page, responseNumber, theme) {
  await page.getByRole('button',{name:new RegExp(`^(Assign|Edit) themes for response ${responseNumber}$`)}).click();
  const choice=page.getByRole('menuitemcheckbox',{name:theme,exact:true});
  if(await choice.getAttribute('aria-checked')!=='true')await choice.click();
  await page.getByRole('menuitem',{name:'Done',exact:true}).click();
}


try {
await scenario('audit authentication and route boundaries',async({page,data})=>{
 await page.goto(researcherServer.url);await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();await capture(page,'r01-sign-in');
 await page.getByRole('button',{name:'Create an account',exact:true}).click();await capture(page,'r02-sign-up');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByLabel('Email address').fill('audit@example.invalid');await page.getByLabel('Password',{exact:true}).fill('invalid-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await capture(page,'r03-auth-error');
 await page.goto(`${researcherServer.url}/reset-password`);await capture(page,'r04-password-reset');
 await page.goto(`${researcherServer.url}/this-route-does-not-exist`);await capture(page,'r05-not-found');
});
await scenario('audit library states',async({page,context,data})=>{
 enrich(data);data.tableFixtures={studies:Array.from({length:7},(_,i)=>({...data.study,id:i?`20000000-0000-4000-8000-00000000000${i+1}`:studyId,title:['Advising experiences','Student belonging and inclusion in remote and on-campus learning environments','AI learning attitudes','Peer collaboration','First-year reflections','Graduate mentoring','Coursework support'][i],status:['open','draft','closed'][i%3]}))};await signIn(context);await page.goto(researcherServer.url);await expect(page.getByRole('heading',{name:'Studies',exact:true})).toBeVisible();await capture(page,'r06-library-list',{widths:[1440,768,390,320]});
 await page.getByLabel('Grid view',{exact:true}).click();await capture(page,'r07-library-grid');
 await page.getByLabel('Find a study',{exact:true}).fill('no match');await capture(page,'r08-library-search-empty');
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Account menu'}).click();await capture(page,'r09-account-menu',{widths:[390]});await page.keyboard.press('Escape');
 data.tableFixtures.studies=[];await page.reload();await capture(page,'r10-library-empty');
});
await scenario('audit study editor and preview',async({page,context,data})=>{
 enrich(data);await signIn(context);await page.goto(`${researcherServer.url}/studies/new`);await expect(page.getByLabel('Study title',{exact:true})).toBeVisible();await capture(page,'r11-study-create',{widths:[1440,768,390,320]});
 await page.getByRole('button',{name:'Save draft & review next steps'}).click();await capture(page,'r12-study-validation');
 await page.getByText('Start from a study template',{exact:true}).click();await capture(page,'r13-study-templates');
 await page.getByLabel('Study title',{exact:true}).fill('Advising study');await page.getByLabel('Research question',{exact:true}).fill('What helps students plan?');await page.getByLabel('Question 1',{exact:true}).fill('What helped you get advising?');
 await page.getByRole('button',{name:'Preview participant experience',exact:true}).click();await capture(page,'r14-preview-introduction');
 await page.getByRole('button',{name:'Next step',exact:true}).click();await capture(page,'r15-preview-consent');
 await page.getByRole('button',{name:'Next step',exact:true}).click();await capture(page,'r16-preview-activity');
 await page.getByRole('button',{name:'Finish preview',exact:true}).click();
});
await scenario('audit study workspace sections',async({page,context,data})=>{
 enrich(data);await signIn(context);
 const applicant={id:'applicant-1',reference:'APPLICANT-001',version_number:1,current_version:true,screened_at:'2026-11-15T12:00:00Z',status:'awaiting_review',decision:'awaiting_review',rule_result:'matches',review_note:'',revision:1,questions:[{id:'q1',prompt:'Have you used advising?',options:[{id:'yes',label:'Yes'}]}],answers:{q1:'yes'},events:[]};
 data.rpcFixtures.get_study_recruitment.applicants=[applicant];
 data.rpcFixtures.get_study_operations.participants=[{id:'enrollment-1',participant_reference:'STUDY-001',version_number:1,joined_at:'2026-11-15T12:00:00Z',required_count:2,completed_required:1,activity_count:2,completed_activities:1,started:true,overdue_count:0,reward_status:'not_recorded',revision:1}];
 for(const section of ['overview','design','recruit','collect','analysis','team-coding','findings','participant-results','settings']){
  await page.goto(studyPath(section));await expect(page.getByRole('heading',{name:data.study.title,exact:true})).toBeVisible();await capture(page,`r17-${section}`);
  if(section==='recruit'){await page.getByRole('button',{name:'Open APPLICANT-001',exact:true}).click();await capture(page,'r18-application-review');await page.getByLabel('Private review note (optional)',{exact:true}).fill('Keep this application note while viewing enrollments.');await page.getByRole('tab',{name:'Enrollments',exact:true}).click();await page.getByText('Recruitment target and coordinator notes',{exact:true}).click();await capture(page,'r19-operations-settings');await page.getByRole('tab',{name:'Applications',exact:true}).click();await expect(page.getByLabel('Private review note (optional)',{exact:true})).toHaveValue('Keep this application note while viewing enrollments.');}
  if(section==='collect'){await page.getByText('View 1 response',{exact:true}).click();await capture(page,'r20-response-details');}
  if(section==='team-coding'){await page.getByRole('button',{name:'Create coding round',exact:true}).click();await capture(page,'r21-coding-round-setup');}
 }
});
await scenario('audit draft and reviewer restrictions',async({page,context,data})=>{
 enrich(data);data.study.status='draft';data.study.current_version_id=null;data.versions=[];data.analyses=[];data.responses=[];await signIn(context);
 for(const section of ['overview','analysis','team-coding','findings','participant-results','collect','settings']){await page.goto(`${researcherServer.url}/studies/${studyId}?section=${section}`);await expect(page.getByRole('heading',{name:data.study.title,exact:true})).toBeVisible();await capture(page,`r22-draft-${section}`);}
 data.study.status='open';data.study.current_version_id=versionId;data.versions=[{...data.study,id:versionId,study_id:studyId,version_number:1,questions:data.questions}];data.role='reviewer';
 for(const section of ['overview','design','analysis','settings','team-coding','participant-results']){await page.goto(studyPath(section));await expect(page.getByRole('heading',{name:data.study.title,exact:true})).toBeVisible();await capture(page,`r23-reviewer-${section}`);}
});
await scenario('audit file import and codebook',async({page,context,data})=>{
 enrich(data);await signIn(context);await page.goto(`${researcherServer.url}/analysis`);await expect(page.getByRole('heading',{name:'Import responses',exact:true})).toBeVisible();await capture(page,'r24-file-import',{widths:[1440,768,390,320]});
 await page.getByRole('button',{name:'Import & continue',exact:true}).click();await capture(page,'r25-import-validation');
 await page.goto(`${researcherServer.url}/code`);await capture(page,'r26-code-direct-without-session');
});
await scenario('audit coding review and results workbench',async({page,context,data})=>{
 enrich(data);data.classifications={Planning:[0,2,3,4,5,6],Support:[1,7,8,9,10],Unclassified:[11]};await signIn(context,values());await page.goto(`${researcherServer.url}/code`);await expect(page.getByRole('heading',{name:'Code responses',exact:true})).toBeVisible();await capture(page,'r27-example-coding',{widths:[1440,768,390,320]});
 await page.getByRole('button',{name:'Edit codebook',exact:true}).click();await capture(page,'r28-codebook-manager');await page.locator('.modal-footer').getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Classify responses',exact:true}).click();await expect(page.getByRole('heading',{name:'Review classifications',exact:true})).toBeVisible();await capture(page,'r29-review-classifications',{widths:[1440,768,390,320]});
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'Accept all',exact:true}).click();await page.getByRole('button',{name:'Next theme',exact:true}).click();}
 await capture(page,'r30-review-unclassified');await page.getByRole('button',{name:'Keep unclassified & generate findings',exact:true}).click();await expect(page.getByRole('tab',{name:'Summary',exact:true})).toBeVisible();
 for(const [name,id] of [['Summary','r31-findings-summary'],['Evidence','r32-findings-evidence'],['Charts','r33-findings-charts'],['Report','r34-file-report']]){await page.getByRole('tab',{name,exact:true}).click();await capture(page,id);}
 await page.getByRole('button',{name:'Preview / print report',exact:true}).click();await capture(page,'r35-file-report-preview');
 await page.goto(`${researcherServer.url}/analysis`);await capture(page,'r36-file-resume');await page.getByRole('button',{name:'Start a new analysis',exact:true}).click();await capture(page,'r37-file-replace-dialog');
});
await scenario('audit saved analysis report',async({page,context,data})=>{
 enrich(data);await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}/questions/${questionId}/results?version=${versionId}&run=legacy-1&tab=report`);await expect(page.getByRole('tab',{name:'Report',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('heading',{name:'Review and research brief',exact:true})).toBeVisible();await capture(page,'r38-saved-run-review');
 await page.getByText('Response flags and supporting quotes · 1 response',{exact:true}).click();await capture(page,'r39-review-flags');await page.getByRole('button',{name:'Preview / print report',exact:true}).click();await capture(page,'r40-saved-report-preview');
});
await scenario('audit extended independent coding states',async({page,context,data})=>{
 enrich(data);const second='10000000-0000-4000-8000-000000000002';
 const responses=Array.from({length:4},(_,i)=>({id:`r${i}`,original:`Synthetic response ${i+1}: ${i%2?'I found my advisor supportive.':'Course planning information was clear.'}`}));
 const round={id:'audit-round',study_id:studyId,version_id:versionId,question_id:questionId,state:'coding',title:'Independent advising coding',prompt:data.questions[0].prompt,codebook:themeList,responses,revision:1};
 const assignment=(id,label,choices,submitted)=>({coder_id:id,label,response_ids:responses.map(r=>r.id),revision:1,submitted_at:submitted?'2026-11-16':null,ballot:Object.fromEntries(responses.map((r,i)=>[r.id,{themes:choices[i],note:''}]))});
 data.codingRound={round,assignments:[assignment(owner,'Study owner',[['Planning'],['Support'],[],['Support']],false),assignment(second,'Second researcher',[['Support'],['Support'],[],['Planning']],false)],decisions:[],events:[{kind:'round_created',recorded_at:'2026-11-16',actor_id:owner}],can_code:true};
 delete data.rpcFixtures.list_coding_rounds;await signIn(context);const url=studyPath('team-coding','&round=audit-round');
 await page.goto(url);await expect(page.getByText('Assigned response 1',{exact:true})).toBeVisible();await capture(page,'r41-independent-ballot');
 data.codingRound.assignments[0].submitted_at='2026-11-16';await page.reload();await expect(page.getByText('Your submitted choices are locked',{exact:false})).toBeVisible();await capture(page,'r42-ballot-locked');
 data.codingRound.round.state='comparison';data.codingRound.assignments[1].submitted_at='2026-11-16';await page.reload();await expect(page.getByRole('heading',{name:'Cohen’s kappa by theme'})).toBeVisible();await capture(page,'r43-team-comparison',{widths:[1440,768,390,320]});
 data.codingRound.round.state='finalized';await page.reload();await capture(page,'r44-team-finalized');
 data.codingRound.round.state='cancelled';await page.reload();await capture(page,'r45-team-cancelled');
});
await scenario('audit extended participant single activity',async({page,data})=>{
 enrich(data);await page.goto(participantServer.url);await expect(page.getByRole('heading',{name:'Join a study',exact:true})).toBeVisible();await capture(page,'p01-join-portal',{widths:[1440,768,390,320]});
 await page.getByLabel('Study code',{exact:true}).fill('x');await page.getByRole('button',{name:'Find study',exact:true}).click();await capture(page,'p02-join-code-validation');
 await page.goto(`${participantServer.url}/join/${code}`);await expect(page.getByRole('button',{name:'Start study',exact:true})).toBeVisible();await capture(page,'p03-study-welcome');
 await page.getByRole('button',{name:'Start study',exact:true}).click();await capture(page,'p04-study-consent');
 await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:/Agree and continue/}).click();await capture(page,'p05-response-question',{widths:[1440,768,390,320]});
 await page.getByRole('button',{name:/Review answers/}).click();await capture(page,'p06-response-validation');
 await page.getByRole('textbox').fill('Fictional answer: the appointment link was useful.');await page.getByRole('button',{name:/Review answers/}).click();await capture(page,'p07-answers-review');
 data.failSubmission=true;await page.getByRole('button',{name:'Submit responses',exact:true}).click();await capture(page,'p08-submission-error');data.failSubmission=false;await page.getByRole('button',{name:'Submit responses',exact:true}).click();await expect(page.getByRole('heading',{name:'Thank you for participating',exact:true})).toBeVisible();await capture(page,'p09-submission-complete');
});
const accessKey='b'.repeat(64);
function participantFixture(data){
 return {...data.versions[0],version_id:versionId,participant_reference:'STUDY-DEMO',study_status:'open',reward_status:'not_recorded',joined_at:'2026-11-15',contact_info:'Study coordinator, research@example.invalid',compensation_details:'Course credit arranged by the study coordinator.',activities:['available','blocked','upcoming','overdue','in_progress','completed','paused'].map((status,i)=>({id:`activity-${i}`,title:['Initial advising reflection','Follow-up after advising','Later reflection','Overdue reflection','Saved reflection','Completed reflection','Paused reflection'][i],required:i<3,status,opens_at:'2026-11-15T12:00:00Z',due_at:'2026-11-20T23:59:00Z',questions:data.questions}))};
}
await scenario('audit extended participant saved studies and activities',async({page,data})=>{
 enrich(data);await page.goto(`${participantServer.url}/my-studies`);await expect(page.getByRole('heading',{name:'Your studies',exact:true})).toBeVisible();await capture(page,'p10-saved-studies-empty');
 data.participantStudy=participantFixture(data);data.activityProgress={draft_answers:{},revision:0};
 await page.getByLabel('Private return link or study key').fill(`${participantServer.url}/my-studies#access=${accessKey}`);await page.getByRole('button',{name:'Open my study',exact:true}).click();await expect(page.getByRole('heading',{name:'Your study progress',exact:true})).toBeVisible();await capture(page,'p11-activities-statuses',{widths:[1440,768,390,320]});
 await page.getByRole('button',{name:'Start activity',exact:true}).first().click();await capture(page,'p12-activity-consent');await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:/Agree and continue/}).click();await page.getByRole('textbox').fill('This is my fictional activity draft.');await page.waitForTimeout(1100);await capture(page,'p13-activity-autosave');await page.getByRole('button',{name:/Review answers/}).click();await capture(page,'p14-activity-review');
 await page.getByRole('button',{name:'Submit this activity',exact:true}).click();await expect(page.getByRole('heading',{name:'Your study progress',exact:true})).toBeVisible();await capture(page,'p15-activity-return');
 await page.getByRole('button',{name:'← Saved studies',exact:true}).click();await capture(page,'p16-saved-studies-populated');await page.getByRole('button',{name:/Forget saved link/}).first().click();await capture(page,'p17-forget-link-dialog');
});
await scenario('audit extended participant screening and recruitment statuses',async({page,data})=>{
 enrich(data);const recruitment={enabled:true,eligibility:'Students who have used advising.',estimated_minutes:8,location:'Online',notice:'Synthetic screening notice for a software audit.',questions:[{id:'s1',prompt:'Have you used advising?',options:[{id:'yes',label:'Yes',qualifies:true},{id:'no',label:'No',qualifies:false}]},{id:'s2',prompt:'How did you meet?',show_if:{question_id:'s1',option_id:'yes'},options:[{id:'online',label:'Online',qualifies:true},{id:'campus',label:'On campus',qualifies:true}]}]};
 data.versions[0].recruitment=recruitment;data.versions[0].activities=[{id:'baseline',title:'Advising reflection',required:true,opens_after_days:0,questions:data.questions}];
 const screening={...data.versions[0],kind:'screening',version_id:versionId,code,reference:'SCREEN-DEMO',recruitment_status:'awaiting_review',study_status:'open',current_version:true,screened_at:'2026-11-15',can_join:false};data.participantStudy={screening};
 data.rpcFixtures.submit_study_screener=screening;
 await page.goto(`${participantServer.url}/join/${code}`);await expect(page.getByRole('button',{name:/Review screening information/})).toBeVisible();await capture(page,'p18-screening-introduction');await page.getByRole('button',{name:/Review screening information/}).click();await capture(page,'p19-screening-permission');await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:/Continue to screening/}).click();await capture(page,'p20-screening-question');await page.getByLabel('Yes',{exact:true}).check();await page.getByRole('button',{name:/Next/}).click();await capture(page,'p21-screening-branch');await page.getByLabel('Online',{exact:true}).check();await page.getByRole('button',{name:'Review screening',exact:true}).click();await capture(page,'p22-screening-review');await page.getByRole('button',{name:'Submit screening',exact:true}).click();await page.waitForTimeout(400);
 for(const status of ['awaiting_review','eligible','waitlisted','not_eligible','invited']){
  data.participantStudy={screening:{...screening,recruitment_status:status,can_join:status==='invited'}};await page.goto(`${participantServer.url}/my-studies#access=${accessKey}`);await page.getByRole('button',{name:'Check for updates',exact:true}).click();await page.waitForTimeout(250);await capture(page,`p23-screening-${status}`);
 }
 data.participantStudy={screening:{...screening,recruitment_status:'invited',can_join:true}};await page.goto(`${participantServer.url}/my-studies#access=${accessKey}`);await page.getByRole('button',{name:'Check for updates',exact:true}).click();await page.getByRole('button',{name:/Review consent and join/}).click();await capture(page,'p24-join-activity-plan');await page.getByRole('button',{name:/Review study consent/}).click();await capture(page,'p25-join-consent');await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:/Agree and continue/}).click();await capture(page,'p26-join-private-link-agreement');
});
await scenario('audit extended participant results and unavailable states',async({page,data})=>{
 enrich(data);await page.goto(`${participantServer.url}/results`);await capture(page,'p27-results-access');
 data.rpcFixtures.get_participant_results={study_title:data.study.title,version_number:1,contact_info:'Study coordinator',release:null};
 await page.getByLabel('Private results or study return link').fill(`${participantServer.url}/my-studies#access=${accessKey}`);await page.getByRole('button',{name:'Open study results',exact:true}).click();await expect(page.getByRole('heading',{name:'No results summary is currently released',exact:true})).toBeVisible();await capture(page,'p28-results-unreleased');
 data.rpcFixtures.get_participant_results.release={release_number:1,released_at:'2026-11-16',content:{title:'What we learned about advising',purpose:'To understand advising experiences.',findings:'Clear guidance and personal support were described as useful.',limitations:'This software audit uses fabricated responses.',next_steps:'Contact the study team for details.'}};await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(page.getByRole('heading',{name:'What we learned about advising',exact:true})).toBeVisible();await capture(page,'p29-results-released');
 data.rpcErrors={get_participant_results:'This private results link is invalid.'};await page.getByRole('button',{name:'Check for updates',exact:true}).click();await capture(page,'p30-results-refresh-error');
 data.rpcErrors={get_public_study:'This study is not available.'};await page.goto(`${participantServer.url}/join/UNKNOWN`);await expect(page.getByRole('heading',{name:'Study unavailable',exact:true})).toBeVisible();await capture(page,'p31-study-unavailable');
 data.rpcErrors={get_participant_portal:'Private study not found. Check your link.'};await page.goto(`${participantServer.url}/my-studies#access=${accessKey}`);await capture(page,'p32-private-study-error');
 data.rpcErrors={};data.study.participant_mode='canvas';await page.goto(`${participantServer.url}/join/${code}`);await page.getByRole('button',{name:'Start study',exact:true}).click();await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:/Agree and continue/}).click();await capture(page,'p33-canvas-unconnected');
});

await scenario('audit recheck deferred and expanded screens',async({page,context,data})=>{
 enrich(data);await signIn(context);
 for(const section of ['team-coding','findings','participant-results']){await page.goto(studyPath(section));await capture(page,`r17-${section}`);}
 data.study.status='draft';data.study.current_version_id=null;data.versions=[];data.analyses=[];data.responses=[];
 for(const section of ['team-coding','findings','participant-results','design']){await page.goto(`${researcherServer.url}/studies/${studyId}?section=${section}`);await capture(page,`r22-draft-${section}`);}
 await page.getByLabel('Enable screening before participants join',{exact:false}).check().catch(()=>{});await page.getByRole('button',{name:'+ Add activity',exact:true}).click();await capture(page,'r46-multiple-activity-editor');
 await page.getByRole('checkbox',{name:/screening/}).first().check().catch(()=>{});await capture(page,'r47-screening-editor');
 await page.getByRole('button',{name:'Preview participant experience',exact:true}).click().catch(()=>{});const dialog=page.getByRole('dialog');if(await dialog.isVisible()){await page.getByRole('button',{name:'Screening',exact:true}).click().catch(()=>{});await capture(page,'r48-screening-preview');await page.keyboard.press('Escape');}
});
await scenario('audit recheck report navigation and unsaved drafts',async({page,context,data})=>{
 enrich(data);await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}/questions/${questionId}/results?version=${versionId}&run=legacy-1&tab=report`);await expect(page.getByRole('tab',{name:'Summary',exact:true})).toBeVisible();
 checks.push({id:'B01',test:'Saved findings direct report link retains requested tab',pass:new URL(page.url()).searchParams.get('tab')==='report',observed:page.url().replace(researcherServer.url,'')});
 await page.getByRole('tab',{name:'Report',exact:true}).click();await expect(page.getByRole('heading',{name:'Review and research brief',exact:true})).toBeVisible();await capture(page,'r38-saved-run-review');
 await page.setViewportSize({width:1440,height:1000});await page.getByLabel('Methods and human review',{exact:true}).fill('UNSAVED-AUDIT-METHODS');await page.getByRole('link',{name:'EduThemes home',exact:true}).click();await expect(page.getByRole('heading',{name:'Studies',exact:true})).toBeVisible();await page.waitForTimeout(200);await page.goBack();await page.getByRole('tab',{name:'Report',exact:true}).click();await expect(page.getByLabel('Methods and human review',{exact:true})).toBeVisible();checks.push({id:'B02',test:'Unsaved saved-run review survives home navigation and back',pass:(await page.getByLabel('Methods and human review',{exact:true}).inputValue())==='UNSAVED-AUDIT-METHODS',observed:await page.getByLabel('Methods and human review',{exact:true}).inputValue()});
 await page.getByText('Response flags and supporting quotes · 1 response',{exact:true}).click();await capture(page,'r39-review-flags');await page.getByRole('button',{name:'Preview / print report',exact:true}).click();await capture(page,'r40-saved-report-preview');
 await page.goto(studyPath('participant-results'));await expect(page.getByLabel('Summary title',{exact:true})).toBeVisible();await page.setViewportSize({width:1440,height:1000});await page.getByLabel('Summary title',{exact:true}).fill('UNSAVED-AUDIT-SUMMARY');await page.getByRole('button',{name:'Overview',exact:true}).click();await page.locator('.study-more-nav > summary').click();await page.getByRole('button',{name:'Participant results',exact:true}).click();await expect(page.getByLabel('Summary title',{exact:true})).toBeVisible();checks.push({id:'B03',test:'Participant-summary unsaved draft survives switching study sections',pass:(await page.getByLabel('Summary title',{exact:true}).inputValue())==='UNSAVED-AUDIT-SUMMARY',observed:await page.getByLabel('Summary title',{exact:true}).inputValue()});
});
await scenario('audit recheck theme modal variants and errors',async({page,context,data})=>{
 enrich(data);data.suggestions=[{name:'Access barriers',description:'Difficulty finding or using support.'}];data.classifications={Planning:[0,2,3,4,5,6],Support:[1,7,8,9,10],Unclassified:[11]};await signIn(context,values());await page.goto(`${researcherServer.url}/code`);await page.getByRole('button',{name:'Suggest themes',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await capture(page,'r49-theme-suggestions');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Edit codebook',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/^Edit /}).first().click();await capture(page,'r50-theme-edit');await page.locator('.modal-footer').getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Classify responses',exact:true}).click();await expect(page.getByRole('heading',{name:'Review classifications',exact:true})).toBeVisible();await page.getByRole('button',{name:'Edit themes',exact:true}).click();await capture(page,'r51-review-current-themes');await page.getByRole('tab',{name:'Add theme',exact:true}).click();await capture(page,'r52-review-add-theme');await page.getByRole('tab',{name:'AI suggestions',exact:true}).click();await capture(page,'r53-review-ai-suggestions');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Reject all',exact:true}).click();await page.getByRole('button',{name:'Next theme',exact:true}).click();await capture(page,'r54-review-after-rejection');checks.push({id:'B04',test:'Rejected-classifications dialog reachability',pass:true,observed:'Rejections are applied directly; old confirmation modal is unreachable in the current flow.'});
});
await scenario('audit recheck pending and retry states',async({page,context,data})=>{
 enrich(data);data.tableDelay=900;await signIn(context);await page.goto(researcherServer.url);await capture(page,'r55-library-loading',{pending:true,widths:[1440,390],wait:100});await expect(page.getByRole('heading',{name:'Studies',exact:true})).toBeVisible();
 data.tableErrors={studies:'Study service connection interrupted.'};await page.reload();await page.waitForTimeout(1300);await capture(page,'r56-library-error');data.tableErrors={};data.tableDelay=0;
 data.rpcErrors={get_study_recruitment:'Recruitment connection interrupted.',get_study_operations:'Operations unavailable.'};await page.goto(studyPath('recruit'));await capture(page,'r57-recruitment-error');
 await page.goto(`${participantServer.url}/join/${code}`);await page.getByRole('button',{name:'Start study',exact:true}).click();await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:/Agree and continue/}).click();await page.getByText('Study information',{exact:true}).click().catch(()=>{});await capture(page,'p34-study-information-expanded');
 await page.goto(`${participantServer.url}/my-studies`);await page.getByRole('button',{name:'Open private link',exact:true}).click();await capture(page,'p35-private-link-dialog');await page.getByLabel('Private study or results link',{exact:true}).fill('bad-link');await page.getByRole('button',{name:'Open my study or results',exact:true}).click();await capture(page,'p36-private-link-validation');
});

await scenario('audit final background job and save conflict states',async({page,context,data})=>{
 enrich(data);data.background=true;data.analyses[0].stage='code';data.analyses[0].results=null;data.rpcFixtures.analysis_job={status:'queued'};await signIn(context);const url=`${researcherServer.url}/studies/${studyId}/questions/${questionId}/code?version=${versionId}`;
 for(const status of ['queued','running','failed','completed']){
  data.rpcFixtures.analysis_job={status,...(status==='failed'?{error:'The analysis service is temporarily unavailable. Your submitted examples were saved.'}:{}),payload:{dataset:values()['eduthemes.dataset'],labels:themeList},result:{claude_data:{Planning:[0],Support:[1],Unclassified:[]},svm_data:{}}};
  await page.goto(url);await page.reload();await expect(page.getByRole('heading',{name:'Code responses',exact:true})).toBeVisible();await page.waitForTimeout(250);await capture(page,`r58-analysis-${status}`,{pending:['queued','running'].includes(status)});
 }
 data.background=false;data.conflictOnSave=true;await page.reload();await assignExampleTheme(page,1,'Clear guidance');await page.waitForTimeout(900);await capture(page,'r59-analysis-save-conflict');
});
await scenario('audit final participant activity conflict and canvas connection',async({page,context,data})=>{
 enrich(data);data.participantStudy=participantFixture(data);data.activityProgress={draft_answers:{},revision:0};data.conflictOnDraft=true;
 await page.goto(`${participantServer.url}/my-studies#access=${accessKey}`);await page.getByRole('button',{name:'Start activity',exact:true}).first().click();await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:/Agree and continue/}).click();await page.getByRole('textbox').fill('Unsaved fictional draft to inspect conflict recovery.');await page.waitForTimeout(1200);await capture(page,'p37-activity-save-conflict');
 await page.getByRole('button',{name:'Return to saved activities',exact:true}).click();data.study.participant_mode='canvas';data.canvas={name:'Synthetic Canvas Participant',academic_year:'Junior',course_name:'Synthetic research methods course',canvas_user_id:'synthetic-123'};
 await page.goto(`${participantServer.url}/canvas#code=synthetic-handoff`);await capture(page,'p38-canvas-connected-portal');await page.goto(`${participantServer.url}/join/${code}`);await page.getByRole('button',{name:'Start study',exact:true}).click();await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:/Agree and continue/}).click();await capture(page,'p39-canvas-sharing-confirmation');await page.getByText('Review all Canvas details',{exact:true}).click();await capture(page,'p40-canvas-details-expanded');
});
await scenario('audit final participant summary release preview and roles',async({page,context,data})=>{
 enrich(data);data.rpcFixtures.get_study_results_workspace={draft:{revision:1,current_release_id:'release-1',sources:[],content:{title:'Advising study results',purpose:'To explore advising experiences.',findings:'Fictional participants valued clear guidance.',limitations:'Synthetic data only.',next_steps:'Contact the study team.'}},releases:[{id:'release-1',release_number:1,released_at:'2026-11-16',sources:[],content:{title:'Previously released summary',findings:'Earlier fictional findings.'}}],events:[]};await signIn(context);await page.goto(studyPath('participant-results'));await expect(page.getByRole('button',{name:'Preview saved summary',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Preview saved summary',exact:true}).click();await capture(page,'r60-participant-release-preview');await page.getByText('Results release history · 1',{exact:true}).click();await page.getByText(/^Release 1 · Current/).click();await capture(page,'r61-participant-release-history');
 data.role='reviewer';await page.reload();await capture(page,'r23-reviewer-participant-results');await page.goto(studyPath('team-coding'));await capture(page,'r23-reviewer-team-coding');
 data.study.status='closed';await page.goto(studyPath('overview'));await capture(page,'r62-closed-study-overview');data.role='owner';await page.goto(studyPath('settings'));await capture(page,'r63-closed-study-settings');
});
await scenario('audit final team ballot navigation protection',async({page,context,data})=>{
 enrich(data);delete data.rpcFixtures.list_coding_rounds;data.codingRound={round:{id:'audit-round',study_id:studyId,version_id:versionId,question_id:questionId,state:'coding',title:'Navigation protection check',prompt:data.questions[0].prompt,codebook:themeList,responses:[{id:'r0',original:'Fictional planning response'}],revision:1},assignments:[{coder_id:owner,label:'Owner',response_ids:['r0'],revision:1,submitted_at:null,ballot:{}}],decisions:[],events:[],can_code:true};await signIn(context);await page.goto(studyPath('team-coding','&round=audit-round'));await page.getByLabel('Coding note for response 1',{exact:true}).fill('UNSAVED-CODING-NOTE');await page.getByRole('button',{name:'Overview',exact:true}).click();await page.locator('.study-more-nav > summary').click();await page.getByRole('button',{name:'Team coding',exact:true}).click();await expect(page.getByLabel('Coding note for response 1',{exact:true})).toBeVisible();checks.push({id:'B05',test:'Unsaved independent coding survives study-section navigation',pass:(await page.getByLabel('Coding note for response 1',{exact:true}).inputValue())==='UNSAVED-CODING-NOTE',observed:await page.getByLabel('Coding note for response 1',{exact:true}).inputValue()});await capture(page,'r64-team-unsaved-note-after-navigation');
});

await scenario('audit closing accessibility keyboard and sustained workloads',async({page,context,data})=>{
 enrich(data);data.classifications={Planning:Array.from({length:50},(_,i)=>i),Support:[],Unclassified:[]};const saved=values();saved['eduthemes.dataset']=Array.from({length:50},(_,i)=>({original:`Response ${i+1}: the advising process was useful because it provided clear information. I appreciated having a checklist to plan my courses and understand my next steps.`,cleaned:'Fictional response',themes:[]}));await signIn(context,saved);await page.goto(`${researcherServer.url}/code`);await page.getByRole('button',{name:'Edit codebook',exact:true}).click();const dialog=page.getByRole('dialog');checks.push({id:'B06',test:'Codebook dialog has an accessible name',pass:Boolean(await dialog.getAttribute('aria-label')||await dialog.getAttribute('aria-labelledby')),observed:{ariaLabel:await dialog.getAttribute('aria-label'),ariaLabelledby:await dialog.getAttribute('aria-labelledby')}});await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await assignExampleTheme(page,1,'Planning');
 await page.getByRole('button',{name:'Classify responses',exact:true}).click();await expect(page.getByRole('heading',{name:'Review classifications',exact:true})).toBeVisible();await capture(page,'r65-fifty-response-review');
 checks.push({id:'B07',test:'Review screen has a main landmark',pass:(await page.getByRole('main').count())===1,observed:await page.getByRole('main').count()});
 await page.setViewportSize({width:390,height:844});const account=page.getByRole('button',{name:'Account menu',exact:true});await account.focus();await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'Sign out',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(account).toBeFocused();checks.push({id:'B08',test:'Account menu supports keyboard navigation and restores focus on Escape',pass:true});
 await page.emulateMedia({reducedMotion:'reduce'});data.tableDelay=1200;await page.goto(researcherServer.url);await expect(page.locator('.edu-skeleton').first()).toBeVisible();const animations=await page.locator('.edu-skeleton').evaluateAll(es=>es.map(e=>getComputedStyle(e,'::after').animationName));checks.push({id:'B09',test:'Skeleton respects reduced-motion preference',pass:animations.length>0&&animations.every(x=>x==='none'),observed:animations});
});
await scenario('audit closing settled library error and recovery',async({page,context,data})=>{
 enrich(data);data.tableErrors={studies:'Study service connection interrupted.'};await signIn(context);await page.goto(researcherServer.url);await expect(page.getByRole('heading',{name:"We couldn't load your studies",exact:true})).toBeVisible({timeout:25000});await capture(page,'r56-library-error');data.tableErrors={};await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('.study-library-table tbody tr')).toHaveCount(1);checks.push({id:'B10',test:'Library error offers a working retry and restores studies',pass:true});
});

} finally {await writeFile(path.join(output,'captures.json'),JSON.stringify(captures,null,2));await writeFile(path.join(output,'checks.json'),JSON.stringify({failures,checks},null,2));await writeFile(path.join(output,'behavior-checks.json'),JSON.stringify(checks,null,2));await browser.close();researcherServer.server.close();participantServer.server.close();if(failures.length)process.exitCode=1;}
