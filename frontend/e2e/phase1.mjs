// Production-bundle walkthroughs using synthetic people and intercepted services.
// Database authorization is tested separately against disposable PostgreSQL.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const participantRoot = process.env.PARTICIPANT_PROJECT || path.resolve(root, '../EduThemes-Participant');
const output = path.resolve(root, 'frontend/test-results/phase1');
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
const participantServer = await serve(path.join(participantRoot, 'dist'));
const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });

async function scenario(name, fn) {
  if (process.env.SCENARIO && !name.includes(process.env.SCENARIO)) return;
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const data = fixture();
  const errors = [];
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const request = route.request();
    const reply = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : null;
    if (url.pathname.startsWith('/auth/v1/')) return reply(user);
    const rpc = url.pathname.split('/rpc/')[1];
    if (rpc) {
      data.calls.push({ rpc, body });
      if (rpc === 'get_study_run_review') return reply({can_edit:data.role==='owner'||data.role==='researcher',current:true,snapshot_hash:'synthetic',review:null,run:data.analyses[0],events:[]});
      if (rpc === 'study_role') return reply(data.role);
      if (rpc === 'pending_study_invitations') return reply(data.pending);
      if (rpc === 'invite_study_member') { data.members.push({ id: 'invitation', study_id: studyId, email: body.p_email, role: body.p_role, created_at: '2026-10-28', accepted_at: null }); return reply('invitation'); }
      if (rpc === 'accept_study_invitation') { data.pending = []; data.role = 'researcher'; return reply(studyId); }
      if (rpc === 'remove_study_member') { data.members = []; return reply(null); }
      if (rpc === 'save_study_draft') { Object.assign(data.study, body.p_form); data.study.draft_revision += 1; data.questions = body.p_form.questions.map((prompt, position) => ({ id: questionId, prompt, position })); return reply(studyId); }
      if (rpc === 'save_file_study') {
        const { p_title, p_question, p_analysis } = body;
        if (data.failImportSave) return reply({message:'Study save interrupted. Try again.',code:'SAVE_INTERRUPTED'},503);
        Object.assign(data.study,{ title:p_title, research_question:p_question, source_type:'file', status:'closed' });
        data.questions = [{ id:questionId, position:0, prompt:p_question }];
        data.versions = [{ ...data.versions[0], questions:data.questions, research_question:p_question, description:body.p_description, import_metadata:p_analysis.import_metadata }];
        data.responses = p_analysis.coded_responses.map(row => ({id:responseId,study_id:studyId,study_version_id:versionId,answers:{[questionId]:row.original}}));
        data.analyses = [{ study_id:studyId, study_version_id:versionId, question_id:questionId, stage:p_analysis.stage, revision:1,
          response_count:data.responses.length, labels:p_analysis.labels, coded_responses:p_analysis.coded_responses.map(row=>({...row,submission_id:responseId})),
          results:{ _draft:true, _run_id:'import-fixture' } }];
        return reply(studyId);
      }
      if (rpc === 'save_study_analysis') {
        if (data.conflictOnSave) return reply({ code: 'PT409', message: 'Another researcher saved this analysis.' }, 409);
        const saved = { ...body.p_snapshot, revision: body.p_expected_revision + 1 };
        data.analyses = [saved]; return reply(saved.revision);
      }
      if (rpc === 'get_public_study' && data.loadDelay) await new Promise((resolve) => setTimeout(resolve, data.loadDelay));
      if (rpc === 'list_coding_rounds' && data.codingRound) return reply([{...data.codingRound.round,coder_count:data.codingRound.assignments.length,submitted_count:data.codingRound.assignments.filter(assignment=>assignment.submitted_at).length}]);
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
      if (table === 'studies') {
        if (request.method() === 'PATCH') { Object.assign(data.study, body); return reply([{ id: studyId }]); }
        return reply(request.headers().accept?.includes('vnd.pgrst.object') ? data.study : [data.study]);
      }
      return reply(({ study_questions: data.questions, study_versions: data.versions, study_submissions: data.responses, study_analyses: data.analyses, study_members: data.members })[table] || []);
    }
    if (url.pathname.endsWith('/research-paper')) {
      data.paperCalls = (data.paperCalls || 0) + 1;
      data.paperRequest = body;
      if (data.paperDelay) await new Promise(resolve => setTimeout(resolve, data.paperDelay));
      if (data.failPaper) return reply({ message: 'The paper service is temporarily unavailable.' }, 503);
      const paragraph = 'The recorded responses describe clear next steps as a useful part of advising. This interpretation is limited to the supplied response units and does not establish a representative participant count or causal relationship. ';
      const markdown = ['# Advising experiences manuscript', '**AI-generated manuscript draft — researcher review required.**', ...['Abstract','Introduction','Methods','Findings','Discussion','Limitations','Conclusion','AI assistance and human review'].flatMap(heading=>[`## ${heading}`, paragraph.repeat(4)]), '## References', '[1] Researcher-supplied source.'].join('\n\n');
      return reply({ markdown, model: 'synthetic-navigator', generated_at: '2026-11-21T02:00:00Z', source_count: 1 });
    }
    if (url.pathname === '/models') return reply({ models: { navigator: true } });
    if (url.pathname === '/session/start') {data.sessionStarts=(data.sessionStarts||0)+1;return reply({ session_id: 'test-session' });}
    if (url.pathname.endsWith('/submit-manual-coding') && data.classifications) { data.manualCoding=body; return reply({claude_data:data.classifications,svm_data:{}}); }
    if (url.pathname.endsWith('/submit-final-dataset') && data.classifications) { data.finalDataset=body.dataset; return reply({summary:'Fictional findings for testing the review and reporting workflow.',themes:body.labels.map(t=>({...t,frequency:body.dataset.filter(entry=>entry.themes.some(theme=>theme.name===t.name)).length}))}); }
    if (url.pathname.endsWith('/upload-dataset')) { data.uploadAttempts=(data.uploadAttempts||0)+1;if(data.failUpload)return reply({message:'Synthetic import connection interrupted.'},503);return reply({ preprocessed_dataset: [{ original: 'A clear appointment link helped.', cleaned: 'A clear appointment link helped.', themes: [] }], predefined_themes: [], dataset_summary: { response_count: 1 } });}
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
    throw error;
  } finally { await context.close(); }
}
async function signIn(context, sessionValues = {}) {
  await context.addInitScript(({ key, session, values }) => {
    if (location.hostname !== '127.0.0.1') return;
    localStorage.setItem(key, JSON.stringify(session));
    for (const [name, value] of Object.entries(values)) if (!sessionStorage.getItem(name)) sessionStorage.setItem(name, JSON.stringify(value));
  }, { key: storageKey, session: { access_token: token, refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }, values: sessionValues });
}

async function assignExampleTheme(page, responseNumber, theme) {
  await page.getByRole('button',{name:new RegExp(`^(Assign|Edit) themes for response ${responseNumber}$`)}).click();
  const choice=page.getByRole('menuitemcheckbox',{name:theme,exact:true});
  if(await choice.getAttribute('aria-checked')!=='true')await choice.click();
  await page.getByRole('menuitem',{name:'Done',exact:true}).click();
}


try {
  await scenario('coding picker preserves multi-theme and no-match examples through filters and keyboard changes',async({page,context,data})=>{
    const labels=[{name:'Planning',description:'Clear next steps',color:'#176b52'},{name:'Support',description:'Help from others',color:'#97543c'}];
    const dataset=[{original:'Good.',cleaned:'Good.',themes:[]},{original:'A clear plan and support from my advisor helped me choose my courses.',cleaned:'A clear plan and support from my advisor helped me choose my courses.',themes:[]}];
    await signIn(context,{'eduthemes.sessionId':'coding-picker-test','eduthemes.dataset':dataset,'eduthemes.labels':labels,'eduthemes.analysisSource':null,'eduthemes.projectMetadata':{researchQuestion:'What supports planning?',projectDescription:'Synthetic UI check',apiKey:''}});
    await page.goto(`${researcherServer.url}/code`);
    await page.getByRole('checkbox',{name:'Uncoded only',exact:true}).check();
    await page.getByRole('button',{name:'Assign themes for response 1',exact:true}).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitemcheckbox',{name:'Planning',exact:true}).focus();await page.keyboard.press('Space');
    await expect(page.getByRole('menuitemcheckbox',{name:'Planning',exact:true})).toHaveAttribute('aria-checked','true');
    await page.getByRole('menuitemcheckbox',{name:'Support',exact:true}).click();
    await expect(page.getByText('Good.',{exact:true})).toBeVisible();
    await page.getByRole('menuitem',{name:'Done',exact:true}).click();
    await expect(page.getByRole('button',{name:'Assign themes for response 2',exact:true})).toBeFocused();
    await page.getByRole('checkbox',{name:'Uncoded only',exact:true}).uncheck();
    await expect(page.getByRole('button',{name:'Remove Planning from response 1',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Remove Support from response 1',exact:true})).toBeVisible();
    await assignExampleTheme(page,1,'No matching theme');
    await expect(page.getByRole('button',{name:'Remove Support from response 1',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Clear no-match coding for response 1',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Clear no-match coding for response 1',exact:true}).click();
    await expect(page.getByRole('button',{name:'Assign themes for response 1',exact:true})).toBeFocused();
    await expect(page.getByRole('button',{name:'Classify responses',exact:true})).toBeDisabled();
    await page.getByRole('searchbox',{name:'Search responses',exact:true}).fill('not a matching response');
    await expect(page.getByText('No responses match these filters.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Show all responses',exact:true}).click();
    await expect(page.getByText('Good.',{exact:true})).toBeVisible();
    assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('eduthemes.dataset')).map(row=>row.original)),dataset.map(row=>row.original));
    for(const width of [1440,1024,768,390,320]){
      await page.setViewportSize({width,height:900});await page.waitForTimeout(300);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(output,`coding-picker-${width}.png`),animations:'disabled'});
      const picker=page.getByRole('button',{name:'Assign themes for response 1',exact:true});await picker.click();
      const menu=page.getByRole('menu');await expect(menu).toBeVisible();const menuBox=await menu.boundingBox();
      assert.ok(menuBox.x>=-1&&menuBox.x+menuBox.width<=width+1,'The theme menu fits the viewport');
      await page.screenshot({path:path.join(output,`coding-picker-menu-${width}.png`),animations:'disabled'});
      await page.keyboard.press('Escape');await expect(picker).toBeFocused();
    }
  });
  await scenario('overview puts unanswered coding work first and launches the selected question directly', async ({page,context,data})=>{
    const secondQuestion='40000000-0000-4000-8000-000000000002';
    data.analyses=[];
    data.questions.push({id:secondQuestion,position:1,prompt:'What would improve advising next time?'});
    data.versions[0].questions=data.questions;
    data.responses[0].answers[secondQuestion]='A shorter appointment process.';
    await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}`);
    const queue=page.getByRole('region',{name:'Questions to analyze',exact:true});
    await expect(queue).toBeVisible();
    const summary=page.getByRole('list',{name:'Study summary'});
    await expect(summary).toContainText('1 submission');
    await expect(summary).toContainText('2 questions with responses');
    await expect(page.getByRole('button',{name:'Continue analysis',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Open analysis',exact:true})).toHaveCount(0);
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(output,`overview-ready-${width}.png`),animations:'disabled'});
    }
    await queue.getByRole('button',{name:/^Start coding/}).first().click();
    await expect(page).toHaveURL(new RegExp(`/questions/${questionId}/code\\?version=${versionId}`));
    await expect(page.getByRole('heading',{name:'Code responses',exact:true})).toBeVisible();
  });
  for(const stage of ['code','review'])await scenario(`overview resumes saved ${stage} work and retains the coded responses`,async({page,context,data})=>{
    const original=structuredClone(data.analyses[0]);
    data.analyses[0]={...original,stage,classifications:stage==='review'?{'Clear guidance':[0],Unclassified:[]}:null,results:{_draft:true,_completed:[original]}};
    await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}`);
    await page.getByRole('region',{name:'Questions to analyze',exact:true}).getByRole('button',{name:new RegExp(stage==='review'?'^Continue review':'^Continue coding')}).click();
    await expect(page.getByRole('heading',{name:stage==='review'?'Review classifications':'Code responses',exact:true})).toBeVisible();
    const dataset=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('eduthemes.dataset')));
    assert.equal(dataset[0].original,original.coded_responses[0].original);
    assert.deepEqual(dataset[0].themes,original.coded_responses[0].themes);
  });
  await scenario('overview opens completed findings without creating a new analysis',async({page,context,data})=>{
    await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}`);
    const queue=page.getByRole('region',{name:'Completed analyses',exact:true});
    await expect(queue.getByRole('button',{name:/Start coding/})).toHaveCount(0);
    await queue.getByRole('link',{name:/^Open findings/}).click();
    await expect(page.getByRole('heading',{name:'Findings',level:1,exact:true})).toBeVisible();
    await expect(page.locator('.workflow-question')).toHaveText(data.questions[0].prompt);
    assert.equal(new URL(page.url()).searchParams.get('version'),versionId);
    assert.equal(new URL(page.url()).searchParams.get('run'),'legacy-1');
    assert.equal(data.calls.filter(call=>call.rpc==='save_study_analysis').length,0);
  });
  await scenario('overview keeps reviewer question actions read-only',async({page,context,data})=>{
    data.role='reviewer';data.analyses=[];
    await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}`);
    const queue=page.getByRole('region',{name:'Questions to analyze',exact:true});
    await expect(queue.getByRole('button',{name:/Start coding|Continue coding|Continue review/})).toHaveCount(0);
    await queue.getByRole('button',{name:/^View responses/}).click();
    assert.equal(new URL(page.url()).searchParams.get('section'),'collect');
    assert.equal(data.calls.filter(call=>call.rpc==='save_study_analysis').length,0);
  });
  await scenario('overview identifies a historical version and previews its frozen design',async({page,context,data})=>{
    const currentVersion='30000000-0000-4000-8000-000000000002';
    data.versions[0].title='Earlier published title';
    data.versions.unshift({...data.versions[0],id:currentVersion,version_number:2,title:'Current published title'});
    data.study.current_version_id=currentVersion;
    await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}?version=${versionId}`);
    const header=page.locator('.study-workspace-header');
    await expect(header.getByRole('heading',{name:'Earlier published title',exact:true})).toBeVisible();
    await expect(header.getByText('Historical version',{exact:true})).toBeVisible();
    await expect(header.getByText('Collecting',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('combobox',{name:'Study version',exact:true})).toHaveValue(versionId);
    await page.getByRole('button',{name:'Participant preview',exact:true}).click();
    await expect(page.getByRole('dialog').getByRole('heading',{name:'Earlier published title',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    data.study.status='draft';data.study.current_version_id=versionId;
    await page.goto(`${researcherServer.url}/studies/${studyId}?version=${versionId}`);
    await expect(header.locator('[data-slot=badge]')).toHaveText('Published version');
  });
  await scenario('researcher flow saves setup, reviews readiness, publishes, and collects before coding',async({page,context,data})=>{
    data.study.status='draft';data.study.current_version_id=null;data.versions=[];data.responses=[];data.analyses=[];
    await signIn(context);await page.goto(researcherServer.url);
    await page.getByRole('button',{name:'Create study',exact:true}).click();
    await page.getByLabel('Study title',{exact:true}).fill('New advising study');
    const setup = page.getByRole('navigation',{name:'Study setup sections'});
    await expect(page.getByLabel('Question 1',{exact:true})).toBeHidden();
    await setup.getByRole('button',{name:'Questions',exact:true}).click();
    await expect(page.getByLabel('Study title',{exact:true})).toBeHidden();
    await page.getByRole('button',{name:'Save draft & review',exact:true}).click();
    await expect(page.getByLabel('Research question',{exact:true})).toBeFocused();
    await expect(page.getByLabel('Study title',{exact:true})).toHaveValue('New advising study');
    await page.getByLabel('Research question',{exact:true}).fill('What helps with advising?');
    await page.getByRole('button',{name:'Continue to questions',exact:true}).click();
    await page.getByLabel('Question 1',{exact:true}).fill('What helped you get advising?');
    await page.getByText('Activity settings',{exact:true}).click();
    await page.locator('#activity-instructions-0').fill('Answer in a few sentences.');
    await page.getByText('Activity settings',{exact:true}).click();
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(() => new Promise(resolve => {
        window.scrollTo(0, 0);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));
      await expect(page.getByRole('banner',{name:'Researcher navigation'})).toHaveCount(1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(output,`study-creation-questions-${width}.png`),animations:'disabled'});
    }
    await page.setViewportSize({width:1280,height:1000});
    await page.getByRole('button',{name:'Continue to participation',exact:true}).click();
    await page.getByLabel('Participant consent text',{exact:true}).fill('Synthetic voluntary participation notice.');
    await setup.getByRole('button',{name:'Questions',exact:true}).click();
    await expect(page.getByLabel('Question 1',{exact:true})).toHaveValue('What helped you get advising?');
    await page.getByRole('button',{name:'Save draft & review',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Study readiness',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Publish study',exact:true})).toBeVisible();
    data.study.current_version_id=versionId;
    data.versions=[{...data.study,id:versionId,study_id:studyId,questions:data.questions,version_number:1,consent_required:true}];
    await page.getByRole('button',{name:'Publish study',exact:true}).click();
    await expect(page.getByRole('button',{name:'Copy participant link',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'No submissions in this version yet',exact:true})).toBeVisible();
    data.responses=[{id:responseId,study_id:studyId,study_version_id:versionId,answers:{[questionId]:'A clear appointment link helped.'},consent_accepted_at:'2026-11-16T12:00:00Z'}];
    await page.getByRole('button',{name:'Refresh responses',exact:true}).click();
    await expect(page.locator('.study-response-group').getByRole('button',{name:/^Start coding/})).toBeVisible();
  });
  await scenario('researcher flow imports directly, retains failed input, and exposes codebook actions',async({page,context,data})=>{
    await signIn(context);await page.goto(researcherServer.url);
    await expect(page.getByRole('button',{name:'Create study',exact:true})).toBeVisible();
    await page.screenshot({path:path.join(output,'streamlined-library-desktop.png'),animations:'disabled'});
    await page.getByRole('link',{name:'Import response file',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Import responses',exact:true})).toBeVisible();
    assert.equal(data.sessionStarts||0,0,'Opening import does not create an empty server session');
    await page.getByLabel('CSV or Excel file · up to 20 MB',{exact:true}).setInputFiles({name:'responses.csv',mimeType:'text/csv',buffer:Buffer.from('Response\nA clear appointment link helped.\n')});
    await page.getByLabel('Research question',{exact:true}).fill('What supports advising?');
    await page.getByLabel('Project description',{exact:true}).fill('Synthetic advising responses.');
    await page.screenshot({path:path.join(output,'streamlined-import-desktop.png'),animations:'disabled'});
    data.failUpload=true;await page.getByRole('button',{name:'Import & continue',exact:true}).click();
    await expect(page.getByText('Synthetic import connection interrupted.',{exact:false})).toBeVisible();
    await expect(page.getByLabel('Research question',{exact:true})).toHaveValue('What supports advising?');
    assert.equal(await page.locator('#import-file').evaluate(input=>input.files[0]?.name),'responses.csv');
    data.failUpload=false;data.failImportSave=true;
    await page.getByRole('button',{name:'Import & continue',exact:true}).click();
    await expect(page.getByText('Study save interrupted. Try again.',{exact:true})).toBeVisible();
    data.failImportSave=false;
    await page.getByRole('button',{name:'Import & continue',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Code responses',exact:true})).toBeVisible();
    const imports = data.calls.filter(call=>call.rpc==='save_file_study');
    assert.equal(imports.length,2);
    assert.equal(imports[0].body.p_import_id,imports[1].body.p_import_id);
    assert.equal(imports[1].body.p_title,'responses');
    assert.equal(imports[1].body.p_analysis.stage,'code');
    assert.equal(data.sessionStarts,1,'Retry reuses the pending import session');assert.equal(data.uploadAttempts,2);
    await expect(page.getByRole('button',{name:'Classify responses',exact:true})).toBeDisabled();
    await expect(page.getByText('Add at least one theme to begin.',{exact:true})).toBeVisible();
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:900});
      await expect(page.getByRole('button',{name:'Add themes',exact:true})).toBeVisible();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const step=await page.locator('.workflow-stepper').boundingBox();
      for(const label of await page.locator('.workflow-stepper__label').all()){const box=await label.boundingBox();assert.ok(box.x>=step.x-1&&box.x+box.width<=step.x+step.width+1,'Every progress label fits');}
      const add=await page.getByRole('button',{name:'Add themes',exact:true}).boundingBox(),table=await page.locator('.preview-main').boundingBox();
      if(width<760)assert.ok(add.y<table.y,'Theme controls precede example coding on phones');
      await page.screenshot({path:path.join(output,`streamlined-coding-${width}.png`),fullPage:true,animations:'disabled'});
    }
    await page.getByRole('button',{name:'Add themes',exact:true}).click();
    await page.getByLabel('Theme name',{exact:true}).fill('Guidance');await page.getByLabel('Definition',{exact:true}).fill('Clear next steps.');
    await page.getByRole('button',{name:'Add theme',exact:true}).click();await page.locator('.modal-footer').getByRole('button',{name:'Close',exact:true}).click();
    await assignExampleTheme(page,1,'Guidance');
    await expect(page.getByRole('button',{name:'Review coded responses',exact:true})).toBeEnabled();
    await expect.poll(()=>data.analyses[0].coded_responses[0].themes[0]?.name).toBe('Guidance');
    const library=await context.newPage();
    await library.setViewportSize({width:320,height:900});
    await library.goto(researcherServer.url);
    await library.getByRole('button',{name:'Imported',exact:true}).click();
    const row=library.getByRole('row').filter({has:library.getByRole('link',{name:'responses',exact:true})});
    await expect(row.getByText('Imported file',{exact:true})).toBeVisible();
    assert.ok(await library.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await row.getByRole('link',{name:'Continue coding',exact:true}).click();
    await expect(library.getByRole('button',{name:'Review coded responses',exact:true})).toBeEnabled();
    await expect(library.getByRole('heading',{name:'Code responses',exact:true})).toBeVisible();
  });
  await scenario('researcher flow moves from collected responses to coding and returns to the same question list',async({page,context,data})=>{
    data.analyses=[];await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}?section=collect&version=${versionId}`);
    const group=page.locator('.study-response-group');await expect(group.getByRole('button',{name:/^Start coding/})).toBeVisible();
    await page.screenshot({path:path.join(output,'streamlined-responses-desktop.png'),animations:'disabled'});
    await group.getByRole('button',{name:/^Start coding/}).click();
    await expect(page.getByRole('heading',{name:'Code responses',exact:true})).toBeVisible();
    await expect(page.locator('.workflow-stepper > li')).toHaveCount(3);
    await expect(page.getByRole('link',{name:'← Back to question list',exact:true})).toHaveAttribute('href',`/studies/${studyId}?section=analysis&version=${versionId}`);
    await page.getByRole('link',{name:'← Back to question list',exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`section=analysis&version=${versionId}`));
    await expect(page.getByRole('button',{name:/^Continue coding/})).toBeVisible();
    await expect(page.getByRole('button',{name:'Open team coding',exact:true})).toBeVisible();
  });
  await scenario('researcher flow opens finished findings before report preparation and protects the saved run',async({page,context,data})=>{
    await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}?section=analysis&version=${versionId}`);
    const card=page.locator('.analysis-question-card');await expect(card.getByRole('link',{name:/^Open findings/})).toBeVisible();
    await expect(card.getByRole('button',{name:/^Start a new run/})).not.toBeVisible();
    await card.getByRole('link',{name:/^Open findings/}).click();
    await expect(page.getByRole('heading',{name:'Findings',level:1,exact:true})).toBeVisible();
    await expect(page.locator('.workflow-question')).toHaveText(data.questions[0].prompt);
    await expect(page.getByRole('list',{name:'Analysis progress',exact:true})).toHaveCount(0);
    await expect(page.getByRole('tab',{name:'Summary',exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.getByRole('tabpanel',{name:'Summary',exact:true}).getByText('Clear instructions helped.',{exact:true})).toBeVisible();
    await expect(page.getByLabel('Methods and human review',{exact:true})).not.toBeVisible();
    await page.screenshot({path:path.join(output,'streamlined-findings-desktop.png'),animations:'disabled'});
    await page.getByRole('button',{name:'Review evidence',exact:true}).click();
    await expect(page.getByRole('tab',{name:'Evidence',exact:true})).toBeFocused();
    await page.getByRole('tab',{name:'Charts',exact:true}).click();
    await page.getByRole('link',{name:'Clear guidance',exact:true}).click();
    await expect(page.getByRole('tab',{name:'Evidence',exact:true})).toHaveAttribute('aria-selected','true');
    const details = page.locator('.theme-evidence-item', { hasText: 'Clear guidance' });
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('summary')).toBeFocused();
    assert.equal(new URL(page.url()).searchParams.get('theme'),'Clear guidance');
    await page.getByRole('button',{name:'Prepare report',exact:true}).click();
    assert.equal(new URL(page.url()).pathname,`/studies/${studyId}/questions/${questionId}/results`);
    assert.equal(new URL(page.url()).searchParams.get('version'),versionId);
    assert.equal(new URL(page.url()).searchParams.has('theme'),false);
    await expect(page.getByRole('heading',{name:'Review and research brief',exact:true})).toBeVisible();
    await page.getByLabel('Methods and human review',{exact:true}).fill('A synthetic report note.');
    await page.getByRole('tab',{name:'Evidence',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Evidence behind the themes',exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'Report',exact:true}).click();
    await expect(page.getByLabel('Methods and human review',{exact:true})).toHaveValue('A synthetic report note.');
    assert.equal(data.calls.filter(call=>call.rpc==='save_study_analysis').length,0,'Opening saved findings does not create or replace a run');
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
  });
  await scenario('saved findings list opens the right run and exports the displayed history', async ({page,context,data}) => {
    const [latest] = data.analyses;
    latest.updated_at = '2026-10-28T12:40:00Z';
    const earlierSummary = 'An earlier pass at the fictional advising responses.';
    const earlier = { ...latest, revision: 0, updated_at: '2026-10-28T12:30:00Z',
      results: { ...latest.results, _run_id: 'earlier-run', summary: `# Initial observations\n\n${earlierSummary}\n\nA course checklist gave the fictional participant a concrete way to plan for the next semester. The example describes one experience and offers no basis for comparing advising approaches across participants.` } };
    latest.results._completed = [earlier];
    await signIn(context);
    await page.goto(`${researcherServer.url}/studies/${studyId}?section=findings&version=${versionId}`);
    const runs = page.getByRole('list', { name: 'Saved analysis runs' });
    await expect(runs.getByRole('listitem')).toHaveCount(1);
    const history = page.getByRole('checkbox', { name: 'Include earlier runs' });
    await history.check();
    await expect(runs.getByRole('listitem')).toHaveCount(2);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download findings report' }).click();
    const report = await readFile(await (await pending).path(), 'utf8');
    assert.ok(report.includes(latest.results.summary));
    assert.ok(report.includes(earlier.results.summary));
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path:path.join(output, `saved-findings-${width}.png`), animations:'disabled' });
    }
    await runs.getByRole('link', { name: /earlier run 1$/ }).click();
    const summary = page.getByRole('tabpanel', { name: 'Summary' });
    await expect(summary).toContainText(earlierSummary);
    await expect(summary.getByRole('heading', { name: 'Initial observations', level: 3 })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path:path.join(output, 'saved-findings-detail-320.png'), animations:'disabled' });
    assert.equal(new URL(page.url()).searchParams.get('run'), 'earlier-run');
    await page.getByRole('link', { name: /Back to saved findings/ }).click();
    await expect(runs).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get('version'), versionId);
  });
  await scenario('professor deliverable preserves examples and prepares an imported-file report', async ({page,context,data})=>{
    const labels=[{name:'Planning',description:'Clear next steps',color:'#176b52'},{name:'Support',description:'Help from others',color:'#97543c'}];
    const dataset=['A fictional no-match example.','A fictional example of planning and support.','A fictional planning response.','A fictional uncategorized response.'].map(original=>({original,cleaned:original,themes:[]}));
    data.classifications={Planning:[3,2,1],Support:[1],Unclassified:[0]};
    await signIn(context,{'eduthemes.sessionId':'file-report-test','eduthemes.dataset':dataset,'eduthemes.labels':labels,'eduthemes.analysisSource':null,'eduthemes.projectMetadata':{researchQuestion:'What supports planning?',projectDescription:'Synthetic test',apiKey:''}});
    await page.goto(`${researcherServer.url}/code`);
    await assignExampleTheme(page,1,'No matching theme');
    await assignExampleTheme(page,2,'Planning');
    await assignExampleTheme(page,2,'Support');
    await page.getByRole('button',{name:'Classify responses',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Review classifications',exact:true})).toBeVisible();
    assert.deepEqual(data.manualCoding.manual_codings,[{index:0,themes:[]},{index:1,themes:labels}]);
    await expect(page.getByRole('button',{name:'Next theme',exact:true})).toBeDisabled();
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:width===1440?1000:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(width<760){await expect(page.getByRole('combobox',{name:'Review theme',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Review theme',exact:true}).selectOption('1');await page.getByRole('combobox',{name:'Review theme',exact:true}).selectOption('0');}
      await page.screenshot({path:path.join(output,`streamlined-review-${width}.png`),fullPage:true,animations:'disabled'});
    }
    await page.setViewportSize({width:1280,height:1000});
    await page.getByRole('button',{name:'Reject response 4',exact:true}).click();
    await page.getByRole('button',{name:'Accept response 3',exact:true}).click();
    await page.getByRole('button',{name:'Accept response 2',exact:true}).click();
    await page.getByRole('button',{name:'Next theme',exact:true}).click();
    await page.getByRole('button',{name:'Accept all',exact:true}).click();
    await page.getByRole('button',{name:'Next theme',exact:true}).click();
    await page.getByRole('button',{name:'Keep unclassified & generate findings',exact:true}).click();
    await expect(page.getByRole('tab',{name:'Summary',exact:true})).toHaveAttribute('aria-selected','true');
    await page.getByRole('tab',{name:'Report',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Prepare your research brief'})).toBeVisible();
    assert.deepEqual(data.finalDataset[1].themes.map(t=>t.name),['Planning','Support']);
    assert.deepEqual(data.finalDataset[2].themes.map(t=>t.name),['Planning']);
    assert.deepEqual(data.finalDataset[3].themes.map(t=>t.name),['Unclassified']);
    await page.getByLabel('Methods and human review',{exact:true}).fill('A fictional demonstration of codebook-guided analysis. No independent reliability study was performed.');
    await page.getByLabel('Limitations',{exact:true}).fill('Four fabricated responses; no research conclusions.');
    await page.getByLabel('AI assistance disclosure',{exact:true}).fill('Responses were supplied by the local test service. No live model was used.');
    await page.getByText('Select supporting quotes · 4 responses',{exact:true}).click();
    await page.getByLabel('Include response 2 as a supporting quote',{exact:true}).check();
    await page.reload();
    await expect(page.getByLabel('Limitations',{exact:true})).toHaveValue('Four fabricated responses; no research conclusions.');
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download research brief',exact:true}).click();
    const file=await download, text=await readFile(await file.path(),'utf8');
    assert.ok(text.includes(dataset[1].original));assert.ok(!text.includes(dataset[0].original));assert.ok(!text.includes('Consent required: Yes'));assert.ok(text.includes('DRAFT'));
    await page.getByRole('button',{name:'Preview / print report',exact:true}).click();
    await expect(page.locator('.research-brief-document')).toContainText('What supports planning?');
    await page.screenshot({path:path.join(output,'professor-report-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await expect(page.getByRole('heading',{name:'Prepare your research brief'})).toBeVisible();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:path.join(output,'professor-report-phone.png'),fullPage:true,animations:'disabled'});
  });

  await scenario('review cards fill their column across short long empty and accepted themes', async ({page,context})=>{
    const labels=[{name:'Brief',description:'Short response',color:'#176b52'},{name:'Detailed',description:'Long response',color:'#97543c'},{name:'Empty',description:'No matching responses',color:'#64748b'},{name:'Unclassified',description:'No matching theme',color:'#cccccc'}];
    const dataset=[{original:'Yes.',themes:[labels[0]]},{original:'A longer advising response describes a course plan, prerequisites, and reassurance about choosing next semester’s courses. '.repeat(25),themes:[labels[1]]},{original:'Other feedback.',themes:[labels[3]]}];
    await signIn(context,{'eduthemes.sessionId':'review-width-test','eduthemes.dataset':dataset,'eduthemes.labels':labels,'eduthemes.claudeData':{Brief:[0],Detailed:[1],Empty:[],Unclassified:[2]},'eduthemes.analysisSource':null,'eduthemes.projectMetadata':{researchQuestion:'What helps students plan?',projectDescription:'Synthetic width check',apiKey:''}});
    await page.goto(`${researcherServer.url}/review`);
    const measure=()=>page.locator('.review-main').evaluate(column=>{
      const parent=column.getBoundingClientRect(),card=column.querySelector(':scope > [data-slot="card"]').getBoundingClientRect();
      return {column:parent.width,card:card.width,left:Math.abs(parent.left-card.left),right:Math.abs(parent.right-card.right),overflow:document.documentElement.scrollWidth-innerWidth};
    });
    for(const width of [1440,1100,900,768,390,320]){
      await page.setViewportSize({width,height:1000});
      let first;
      for(let index=0;index<labels.length;index++){
        const picker=page.getByRole('combobox',{name:'Review theme',exact:true});
        if(await picker.isVisible())await picker.selectOption(String(index));
        else await page.locator('.review-theme-list__item').nth(index).click();
        await expect(page.locator('.review-main .workflow-toolbar h5')).toContainText(labels[index].name);
        const bounds=await measure();
        assert.ok(bounds.left<1&&bounds.right<1,`Review card must fill its ${bounds.column}px column at ${width}px, theme ${labels[index].name}; actual ${bounds.card}px`);
        assert.equal(bounds.overflow,0);
        if(first===undefined)first=bounds.card;else assert.ok(Math.abs(first-bounds.card)<1,'Switching themes must not resize the card');
        if(index===0){
          const accept=page.getByRole('button',{name:'Accept response 1',exact:true});
          if(await accept.count())await accept.click();
          const accepted=await measure();assert.ok(Math.abs(bounds.card-accepted.card)<1,'Accepted-state controls must not resize the card');
        }
        if([1440,390].includes(width)&&index<2)await page.screenshot({path:path.join(output,`review-full-width-${width}-${labels[index].name}.png`),fullPage:true});
      }
    }
  });
  await scenario('review edits missing themes, preserves cancelled choices, and exports every reviewed assignment', async ({page,context,data})=>{
    const planning={name:'Planning',description:'Clear next steps',color:'#176b52'};
    const support={name:'Support',description:'Help from others',color:'#97543c'};
    const unclassified={name:'Unclassified',description:'No matching theme',color:'#cccccc'};
    const labels=[planning,support,unclassified];
    const dataset=[
      {original:'A plan and reassurance helped.',submission_id:'review-source-1',themes:[planning],review_decisions:{Planning:{action:'approve'}}},
      {original:'This response is outside the codebook.',submission_id:'review-source-2',themes:[support],review_decisions:{Support:{action:'approve'}}},
      {original:'The advisor provided a plan and support.',submission_id:'review-source-3',themes:[unclassified]},
    ];
    data.classifications={Planning:[0],Support:[1],Unclassified:[2]};
    await signIn(context,{'eduthemes.sessionId':'review-edit-test','eduthemes.dataset':dataset,'eduthemes.labels':labels,'eduthemes.claudeData':data.classifications,'eduthemes.analysisSource':null,'eduthemes.projectMetadata':{researchQuestion:'What supports planning?',projectDescription:'Synthetic correction verification',apiKey:''}});
    await page.goto(`${researcherServer.url}/review`);
    const editor=page.getByRole('dialog',{name:'Edit themes for response 1',exact:true});
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:900});
      await page.getByRole('button',{name:'Edit themes for response 1',exact:true}).click();
      await expect(editor).toContainText(dataset[0].original);
      await editor.getByRole('checkbox',{name:'Planning Clear next steps',exact:true}).uncheck();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(output,`review-editor-${width}.png`),fullPage:true,animations:'disabled'});
      await editor.getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(page.getByRole('button',{name:'Edit themes for response 1',exact:true})).toBeFocused();
      await expect(page.locator('.review-response-card.is-approved')).toHaveCount(1);
    }
    await page.getByRole('button',{name:'Edit themes for response 1',exact:true}).click();
    await editor.getByRole('checkbox',{name:'Support Help from others',exact:true}).focus();
    await page.keyboard.press('Space');
    await editor.getByRole('button',{name:'Save reviewed themes',exact:true}).click();
    await page.reload();
    await page.getByRole('button',{name:'Edit themes for response 1',exact:true}).click();
    await expect(editor.getByRole('checkbox',{name:'Planning Clear next steps',exact:true})).toBeChecked();
    await expect(editor.getByRole('checkbox',{name:'Support Help from others',exact:true})).toBeChecked();
    await editor.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('combobox',{name:'Review theme',exact:true}).selectOption('1');
    await page.getByRole('button',{name:'Edit themes for response 2',exact:true}).click();
    const clearing=page.getByRole('dialog',{name:'Edit themes for response 2',exact:true});
    await clearing.getByRole('checkbox',{name:'Support Help from others',exact:true}).uncheck();
    await clearing.getByRole('button',{name:'Save reviewed themes',exact:true}).click();
    await expect(page.getByRole('button',{name:'Edit themes for response 1',exact:true})).toBeFocused();
    await page.getByRole('combobox',{name:'Review theme',exact:true}).selectOption('2');
    await page.getByRole('button',{name:'Edit themes for response 3',exact:true}).click();
    const assigning=page.getByRole('dialog',{name:'Edit themes for response 3',exact:true});
    await assigning.getByRole('checkbox',{name:'Planning Clear next steps',exact:true}).check();
    await assigning.getByRole('checkbox',{name:'Support Help from others',exact:true}).check();
    await assigning.getByRole('button',{name:'Save reviewed themes',exact:true}).click();
    await page.getByRole('button',{name:'Keep unclassified & generate findings',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Findings',exact:true})).toBeVisible();
    assert.deepEqual(data.finalDataset.map(row=>row.original),dataset.map(row=>row.original));
    assert.deepEqual(data.finalDataset.map(row=>row.submission_id),dataset.map(row=>row.submission_id));
    assert.deepEqual(data.finalDataset.map(row=>row.themes.map(theme=>theme.name)),[['Planning','Support'],['Unclassified'],['Planning','Support']]);
    await page.getByRole('tab',{name:'Report',exact:true}).click();
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download research brief',exact:true}).click();
    const text=await readFile(await (await download).path(),'utf8');
    assert.match(text,/Planning: 2/);
    assert.match(text,/Support: 2/);
    assert.match(text,/Unclassified: 1/);
    await page.getByRole('button',{name:'Preview / print report',exact:true}).click();
    await page.emulateMedia({media:'print'});
    const printed=await page.locator('.research-brief-document').boundingBox();
    assert.ok(printed && printed.y < 2 && printed.x < 2,'Printed report starts at the page origin without hidden application spacing');
    await page.pdf({path:path.join(output,'corrected-review-print.pdf'),format:'Letter',printBackground:true});
    await page.emulateMedia({media:'screen'});
  });

  await scenario('research paper drafts generate from saved findings, retain edits on failure, and print separately', async ({page,context,data})=>{
    await signIn(context);
    data.paperDelay=800;
    await page.goto(`${researcherServer.url}/studies/${studyId}?section=findings&version=${versionId}`);
    const paper=page.locator('.paper-draft');
    await expect(paper.getByRole('button',{name:'Generate paper draft with NaviGator',exact:true})).toBeEnabled();
    await paper.getByText('Paper title, authors, length, and references',{exact:true}).click();
    await paper.getByLabel('Author names (optional)',{exact:true}).fill('Synthetic Test Author');
    await paper.getByLabel('References and source notes (optional)',{exact:true}).fill('Researcher-supplied source.\nNotes provided for the draft.');
    await paper.getByRole('button',{name:'Generate paper draft with NaviGator',exact:true}).click();
    await expect(paper.getByRole('button',{name:'Writing paper with NaviGator…',exact:true})).toHaveAttribute('aria-busy','true');
    await expect(paper.getByRole('status').filter({hasText:'NaviGator is writing the complete manuscript.'})).toBeVisible();
    await expect(paper.getByRole('heading',{name:'Advising experiences manuscript',exact:true})).toBeVisible();
    assert.equal(data.paperCalls,1);assert.equal(data.paperRequest.sources[0].snapshot_hash,'synthetic');
    assert.equal(data.paperRequest.paper.authors,'Synthetic Test Author');assert.equal(data.paperRequest.paper.references.length,1);
    await paper.getByRole('button',{name:'Edit paper draft',exact:true}).click();
    const edited='# Edited paper title\n\nManually checked manuscript content.\n\n'+await paper.getByLabel('Paper draft (Markdown)',{exact:true}).inputValue();
    await paper.getByLabel('Paper draft (Markdown)',{exact:true}).fill(edited);
    const downloading=page.waitForEvent('download');await paper.getByRole('button',{name:'Download paper draft',exact:true}).click();
    const download=await downloading;assert.equal(await readFile(await download.path(),'utf8'),edited);
    await page.reload();await paper.getByRole('button',{name:'Edit paper draft',exact:true}).click();
    await expect(paper.getByLabel('Paper draft (Markdown)',{exact:true})).toHaveValue(edited);assert.equal(data.paperCalls,1);
    data.failPaper=true;await paper.getByRole('button',{name:'Generate a new paper draft',exact:true}).click();
    await expect(paper.getByRole('alert')).toContainText('temporarily unavailable');
    await expect(paper.getByLabel('Paper draft (Markdown)',{exact:true})).toHaveValue(edited);
    data.failPaper=false;
    await page.getByRole('link',{name:/^Open findings for/}).click();
    await page.getByRole('tab',{name:'Report',exact:true}).click();
    await page.getByRole('button',{name:'Preview / print report',exact:true}).click();
    await expect(page.locator('.research-brief-document')).toBeVisible();
    await paper.getByRole('button',{name:'Generate paper draft with NaviGator',exact:true}).click();
    await expect(paper.getByRole('heading',{name:'Advising experiences manuscript',exact:true})).toBeVisible();
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
      await paper.screenshot({path:path.join(output,`research-paper-${width}.png`)});
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>{window.print=()=>{window.paperPrintRequested=true;};});
    await paper.getByRole('button',{name:'Print / save paper as PDF',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.paperPrintRequested),true);
    await page.emulateMedia({media:'print'});
    await expect(page.locator('.paper-print-target')).toBeVisible();
    await expect(page.locator('.research-brief-document')).not.toBeVisible();
    await expect(page.getByRole('banner')).not.toBeVisible();
    await page.pdf({path:path.join(output,'research-paper-export.pdf'),format:'A4',printBackground:true,margin:{top:'18mm',bottom:'18mm',left:'18mm',right:'18mm'}});
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    await page.emulateMedia({media:null});
  });
  await scenario('team coding separates submission from round management and wraps choices and actions', async ({page,context,data})=>{
    const codebook=[
      {name:'Course Planning Support',description:'Advisor assisted in creating a course schedule and mapping prerequisites for future classes.'},
      {name:'Major Change Guidance',description:'Advisor provided reassurance that changing majors would not delay graduation.'},
      {name:'Emotional Reassurance',description:'Advisor listened to concerns and helped reduce student anxiety about academic planning.'},
    ];
    const responses=[{id:responseId,original:'The advisor listened to my worries and helped me feel less anxious.'}];
    data.codingRound={round:{id:'layout-round',study_id:studyId,version_id:versionId,question_id:questionId,state:'coding',title:'Academic advising coding round',prompt:'Describe your advising experience.',codebook,responses,revision:1},
      assignments:[{coder_id:owner,label:'Study owner',response_ids:[responseId],submitted_at:null,ballot:{},revision:1},{coder_id:'10000000-0000-4000-8000-000000000002',label:'Second coder',response_ids:[responseId],submitted_at:null,ballot:{},revision:1}],decisions:[],events:[],can_code:true};
    await signIn(context);
    await page.goto(`${researcherServer.url}/studies/${studyId}?section=team-coding&version=${versionId}&round=layout-round`);
    const choices=page.getByRole('group',{name:'Themes for assigned response 1'});
    await choices.getByRole('checkbox',{name:'Emotional Reassurance',exact:false}).check();
    await expect(page.getByRole('button',{name:'Save my coding draft',exact:true})).toBeEnabled();
    await expect(page.getByRole('button',{name:'Submit and lock my coding',exact:true})).toBeDisabled();
    await page.getByRole('checkbox',{name:'I completed my assigned responses',exact:false}).check();
    await expect(page.getByRole('button',{name:'Submit and lock my coding',exact:true})).toBeEnabled();
    await expect(page.getByRole('button',{name:'Open team comparison',exact:true})).toBeDisabled();
    await expect(page.getByText('Team comparison opens after every assigned coder submits and locks their choices.')).toBeVisible();
    await page.getByLabel('Coding note for response 1',{exact:true}).fill('Retain this note while the layout changes.');
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`No page overflow at ${width}`);
      const layout=await page.evaluate(()=>{
        const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
        const submit=rect('.coding-submit-panel'),management=rect('.coding-round-management');
        const buttons=[...document.querySelectorAll('.coding-submit-actions > button,.coding-management-actions > button')].map(el=>el.getBoundingClientRect().toJSON());
        const choices=[...document.querySelectorAll('.coding-theme-choice')].map(el=>({label:el.getBoundingClientRect().toJSON(),checkbox:el.querySelector('[role=checkbox]').getBoundingClientRect().toJSON(),text:el.querySelector(':scope > span').getBoundingClientRect().toJSON()}));
        return {submit,management,buttons,choices};
      });
      assert.ok(layout.management.top-layout.submit.bottom>=23,'Submission and management have a clear gap');
      for(const item of layout.choices){assert.ok(item.text.left-item.checkbox.right>=10);assert.ok(item.label.bottom>=item.text.bottom);}
      if(width<=600){for(const pair of [[0,1],[2,3]])assert.ok(layout.buttons[pair[1]].top-layout.buttons[pair[0]].bottom>=10,'Mobile buttons are separated');}
      await expect(choices.getByRole('checkbox',{name:'Emotional Reassurance',exact:false})).toBeChecked();
      await expect(page.getByLabel('Coding note for response 1',{exact:true})).toHaveValue('Retain this note while the layout changes.');
      await page.locator('.coding-round-workspace').screenshot({path:path.join(output,`team-coding-layout-${width}.png`)});
    }
    await choices.getByRole('checkbox',{name:'No matching theme',exact:true}).check();
    await expect(choices.getByRole('checkbox',{name:'Emotional Reassurance',exact:false})).not.toBeChecked();
    await choices.getByRole('checkbox',{name:'Course Planning Support',exact:false}).focus();
    await page.keyboard.press('Space');
    await expect(choices.getByRole('checkbox',{name:'Course Planning Support',exact:false})).toBeChecked();
    await expect(choices.getByRole('checkbox',{name:'No matching theme',exact:true})).not.toBeChecked();
  });
  await scenario('professor deliverable shows independent per-theme kappa and exports its calculation', async ({page,context,data})=>{
    const second='10000000-0000-4000-8000-000000000002';
    const responses=Array.from({length:4},(_,i)=>({id:`r${i}`,original:`Private fictional round response ${i}`}));
    const first=[['Planning','Support'],['Planning'],[],[]], other=[['Planning','Support'],[],['Planning'],[]];
    data.codingRound={round:{id:'reliability-round',study_id:studyId,version_id:versionId,question_id:questionId,state:'comparison',title:'Independent reliability example',prompt:'What supports planning?',codebook:[{name:'Planning'},{name:'Support'},{name:'Absent'}],responses,revision:1},
      assignments:[{coder_id:owner,label:'Owner',response_ids:responses.map(r=>r.id),submitted_at:'2026-11-16',ballot:Object.fromEntries(responses.map((r,i)=>[r.id,{themes:first[i],note:'Private coding note'}]))},{coder_id:second,label:'Independent coder',response_ids:responses.map(r=>r.id),submitted_at:'2026-11-16',ballot:Object.fromEntries(responses.map((r,i)=>[r.id,{themes:other[i]}]))}],decisions:[],events:[],can_code:false};
    await signIn(context);await page.goto(`${researcherServer.url}/studies/${studyId}?section=team-coding&version=${versionId}&round=reliability-round`);
    await expect(page.getByRole('heading',{name:'Cohen’s kappa by theme'})).toBeVisible();
    const table=page.locator('.coding-reliability table');await expect(table).toContainText('0.000');await expect(table).toContainText('1.000');await expect(table).toContainText('No variation');
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download coding and agreement report'}).click();
    const file=await download,text=await readFile(await file.path(),'utf8');assert.ok(text.includes('| Planning | 0.000 |'));assert.ok(!text.includes('Private coding note'));assert.ok(!text.includes(responses[0].original));
    await page.screenshot({path:path.join(output,'professor-kappa-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:path.join(output,'professor-kappa-phone.png'),fullPage:true,animations:'disabled'});
  });

  await scenario('participant portal matches the workspace and preserves private activity access', async ({ page, data }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(participantServer.url);
    await expect(page.getByRole('heading', { name: 'Join a study', exact: true })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Participant workspace' })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'participant-portal-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'participant-portal-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.getByLabel('Study code', { exact: true }).fill(code.toLowerCase());
    await page.getByRole('button', { name: 'Find study', exact: true }).click();
    await expect(page.getByRole('heading', { name: data.study.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start study', exact: true })).toBeVisible();
    await expect(page.locator('.participant-sidebar')).not.toBeVisible();
    await page.getByRole('link', { name: 'EduThemes home', exact: true }).click();
    await page.getByRole('link', { name: 'My studies', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your studies', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'participant-saved-studies-mobile.png'), fullPage: true, animations: 'disabled' });
    const key = 'b'.repeat(64);
    data.participantStudy = { ...data.versions[0], version_id: versionId, participant_reference: 'STUDY-DEMO', study_status: 'open', reward_status: 'not_recorded', activities: [
      { id: 'baseline', title: 'Classroom reflections', required: true, status: 'available', opens_at: '2026-10-28T12:00:00Z', questions: data.questions },
      { id: 'followup', title: 'Follow-up reflection', required: true, status: 'blocked', opens_at: '2026-11-04T12:00:00Z', questions: data.questions },
    ] };
    data.activityProgress = { draft_answers: {}, revision: 0 };
    await page.getByLabel('Private return link or study key').fill(`${participantServer.url}/my-studies#access=${key}`);
    await page.getByRole('button', { name: 'Open my study', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your study progress', exact: true })).toBeVisible();
    assert.equal((await page.textContent('body')).includes(key), false);
    assert.equal(page.url().includes(key), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'participant-hub-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    const openActivities=page.getByRole('button', { name: 'Open activities', exact: true });
    if(await openActivities.isVisible())await openActivities.click();
    else await page.getByRole('button',{name:'Open study',exact:true}).click();
    await expect(page.getByRole('heading', { name: 'Your study progress', exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(output, 'participant-hub-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Start activity', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Classroom reflections', exact: true })).toBeVisible();
    await expect(page.locator('.participant-sidebar')).not.toBeVisible();
  });
  await scenario('owner can invite collaborators, inspect published consent, and trace theme evidence', async ({ page, context, data }) => {
    await signIn(context);
    await page.goto(`${researcherServer.url}/studies/${studyId}`);
    await expect(page.getByRole('heading', { name: 'Advising experiences' })).toBeVisible();
    await page.getByText('View published questions and consent').click();
    await expect(page.getByText(data.study.consent_text, { exact: true })).toBeVisible();
    await page.getByText('Clear guidance · 1 of 1 coded responses').click();
    await expect(page.getByText('Classification accepted', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'View original response and consent record' }).click();
    await expect(page.locator(`#response-${responseId}`)).toBeVisible();
    await page.getByLabel('Collaborator email').fill('colleague@ufl.edu');
    await page.getByRole('button', { name: 'Create invitation' }).click();
    await expect(page.getByText('colleague@ufl.edu', { exact: true })).toBeVisible();
    assert.equal(data.calls.find((call) => call.rpc === 'invite_study_member').body.p_role, 'researcher');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(output, 'researcher-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByLabel('Collaborator email').scrollIntoViewIfNeeded();
    await expect(page.getByLabel('Collaborator email')).toBeInViewport();
    await page.screenshot({ path: path.join(output, 'researcher-mobile.png'), animations: 'disabled' });
  });
  await scenario('reviewers cannot edit, invite, change publication, or launch coding', async ({ page, context, data }) => {
    data.role = 'reviewer'; await signIn(context);
    await page.goto(`${researcherServer.url}/studies/${studyId}`);
    await expect(page.getByText('You have read-only access to this study.')).toBeVisible();
    for (const name of ['Close study', 'Create invitation', 'Start coding', 'Analyze current responses', 'Edit draft']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download responses and consent records' })).toBeVisible();
  });
  await scenario('draft editor saves consent and an explicit identity mode together', async ({ page, context, data }) => {
    data.study.status = 'draft'; data.study.current_version_id = null; data.versions = []; data.analyses = [];
    data.study.consent_text = ''; await signIn(context);
    await page.goto(`${researcherServer.url}/studies/${studyId}`);
    await expect(page.getByRole('button', { name: 'Publish study', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Edit draft' }).click();
    await page.getByLabel('Participant consent text').fill('You may choose whether to participate. Contact the team with questions.');
    await page.getByLabel('Participant identity', { exact: true }).selectOption('anonymous');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('button', { name: 'Publish study', exact: true })).toBeEnabled();
    const saved = data.calls.find((call) => call.rpc === 'save_study_draft').body;
    assert.equal(saved.p_expected_revision, 2); assert.equal(saved.p_form.questions[0], data.questions[0].prompt);
  });
  await scenario('invited collaborators can accept before opening study data', async ({ page, context, data }) => {
    data.pending = [{ id: 'invitation', study_id: studyId, title: data.study.title, role: 'researcher' }];
    await signIn(context); await page.goto(`${researcherServer.url}/?invitation=invitation`);
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page).toHaveURL(`${researcherServer.url}/studies/${studyId}`);
    await expect(page.getByText('Your access:', { exact: false })).toContainText('researcher');
  });
  await scenario('study analysis saves source IDs, version IDs, and the expected revision', async ({ page, context, data }) => {
    data.analyses = []; await signIn(context); await page.goto(`${researcherServer.url}/studies/${studyId}`);
    await page.getByRole('region', { name: 'Questions to analyze', exact: true }).getByRole('button', { name: /^Start coding/ }).click();
    await expect(page.getByRole('heading', { name: 'Code responses', exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Analysis save status', exact: true })).toHaveText('Saved');
    const saved = data.calls.find((call) => call.rpc === 'save_study_analysis').body;
    assert.equal(saved.p_snapshot.study_version_id, versionId);
    assert.equal(saved.p_snapshot.coded_responses[0].submission_id, responseId);
    assert.equal(saved.p_expected_revision, 0);
  });
  await scenario('participant consent is explicit, drafts recover after reload, and retries keep one ID', async ({ page, data }) => {
    await page.goto(`${participantServer.url}/join/${code}`);
    await page.getByRole('button', { name: 'Start study' }).click();
    await expect(page.getByRole('heading', { name: 'Before you take part' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agree and continue' })).toBeDisabled();
    await page.screenshot({ path: path.join(output, 'participant-consent.png'), fullPage: true });
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await page.getByRole('textbox').fill('A clear appointment link helped.');
    await page.reload();
    await page.getByRole('button', { name: 'Start study' }).click();
    await expect(page.getByRole('button', { name: 'Agree and continue' })).toBeDisabled();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('A clear appointment link helped.');
    await page.getByRole('button', { name: 'Review answers' }).click();
    data.failSubmission = true; await page.getByRole('button', { name: 'Submit responses' }).click();
    await expect(page.getByRole('alert')).toContainText('Connection interrupted');
    data.failSubmission = false; await page.getByRole('button', { name: 'Submit responses' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for participating' })).toBeVisible();
    const submissions = data.calls.filter((call) => call.rpc === 'submit_study_version');
    assert.equal(submissions.length, 2); assert.equal(submissions[0].body.p_request_id, submissions[1].body.p_request_id);
    assert.equal(submissions[0].body.p_consent_accepted, true);
    assert.equal(submissions[0].body.p_version_id, versionId);
    await expect(page.getByRole('button', { name: 'Download study receipt' })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name: 'Thank you for participating' })).toBeVisible();
  });
  await scenario('participant slides validate one answer, support keyboard navigation, and review without submitting early', async ({ page, data }) => {
    data.loadDelay = 350; data.submitDelay = 500;
    data.questions.push({ id: 'question-two', prompt: 'What would make that experience better?', position: 1 });
    data.questions.push({ id: 'question-three', prompt: 'Is there anything else you would like the research team to understand about getting help and finding the information you need?', position: 2 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${participantServer.url}/join/${code}`);
    await expect(page.getByRole('status')).toContainText('Loading your study');
    await expect(page.getByRole('heading', { name: 'Study unavailable' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start study' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: data.questions[0].prompt })).toBeFocused();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Please add your answer');
    await page.getByRole('textbox').fill('   ');
    await page.getByRole('textbox').press('Control+Enter');
    await expect(page.getByRole('heading', { name: data.questions[0].prompt })).toBeVisible();
    await page.getByRole('textbox').fill('Clear guidance');
    await page.getByRole('textbox').press('End');
    await page.getByRole('textbox').press('Enter');
    await page.getByRole('textbox').pressSequentially('and a helpful advisor.');
    await expect(page.getByRole('textbox')).toHaveValue('Clear guidance\nand a helpful advisor.');
    await page.getByRole('textbox').press('Control+Enter');
    await expect(page.getByRole('heading', { name: data.questions[1].prompt })).toBeFocused();
    await expect(page.getByRole('textbox')).toHaveValue('');
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
    await page.getByRole('textbox').fill('An easier way to book.');
    await page.getByRole('button', { name: 'Previous question' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('Clear guidance\nand a helpful advisor.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('textbox')).toHaveValue('An easier way to book.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox').fill('Please keep the directions simple.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await expect(page.getByRole('button', { name: 'Review answers' })).toBeInViewport();
    await page.screenshot({ path: path.join(output, 'participant-slide-mobile.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('button', { name: 'Review answers' })).toBeInViewport();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, 'participant-slide-desktop.png'), animations: 'disabled' });
    await page.getByRole('textbox').press('Meta+Enter');
    await expect(page.getByRole('heading', { name: 'Ready when you are.' })).toBeFocused();
    await page.getByRole('button', { name: 'Edit answer 1', exact: true }).press('Control+Enter');
    assert.equal(data.calls.filter((call) => call.rpc === 'submit_study_version').length, 0);
    await page.getByRole('button', { name: 'Edit answer 1', exact: true }).click();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await page.getByRole('textbox').fill('Updated first answer.');
    await page.getByRole('button', { name: 'Back to review' }).click();
    await expect(page.getByText('Updated first answer.', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'participant-review-desktop.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Submit responses' }).click();
    await expect(page.getByRole('button', { name: 'Submitting…' })).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('Updated first answer.', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Thank you for participating' })).toBeVisible();
    assert.deepEqual(data.calls.find((call) => call.rpc === 'submit_study_version').body.p_answers, {
      [questionId]: 'Updated first answer.', 'question-two': 'An easier way to book.', 'question-three': 'Please keep the directions simple.',
    });
  });
  await scenario('participant multi-activity slides keep consent, drafts, retries, and completion intact', async ({ page, data }) => {
    const activities = [
      { id: 'baseline', title: 'Baseline reflection', required: true, status: 'available', opens_after_days: 0,
        questions: [{ id: questionId, prompt: data.questions[0].prompt }, { id: 'followup-question', prompt: 'What could improve?' }] },
      { id: 'followup', title: 'Follow-up', required: true, status: 'blocked', opens_after_days: 1, questions: [{ id: 'later-question', prompt: 'What changed?' }] },
    ];
    data.versions[0].activities = activities;
    data.participantStudy = { ...data.versions[0], version_id: versionId, activities, participant_reference: 'STUDY-TEST', study_status: 'open', reward_status: 'not_recorded' };
    data.activityProgress = { draft_answers: {}, revision: 0 };
    data.saveDelay = 350;
    await page.goto(`${participantServer.url}/join/${code}`);
    await page.getByRole('button', { name: 'Review study consent' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('button', { name: 'Join and open my activities' })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I agree that my responses and progress', exact: false }).check();
    await page.getByRole('button', { name: 'Join and open my activities' }).click();
    const enrollment = data.calls.find((call) => call.rpc === 'enroll_study').body;
    assert.equal(enrollment.p_consent_accepted, true); assert.equal(enrollment.p_linking_accepted, true);
    await page.getByRole('button', { name: 'Start activity' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await page.getByRole('textbox').fill('My baseline draft.');
    await expect.poll(() => data.calls.filter((call) => call.rpc === 'save_activity_draft').length).toBeGreaterThan(0);
    await expect(page.getByRole('textbox')).toBeEnabled();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('textbox').fill('More accessible booking.');
    await page.getByRole('button', { name: 'Back to activities', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your study progress' })).toBeVisible();
    assert.equal(data.activityProgress.draft_answers['followup-question'], 'More accessible booking.');
    await page.getByRole('button', { name: 'Start activity' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('More accessible booking.');
    await page.getByRole('button', { name: 'Review answers' }).click();
    data.failSubmission = true; await page.getByRole('button', { name: 'Submit this activity' }).click();
    await expect(page.getByRole('alert')).toContainText('Connection interrupted');
    await expect(page.getByText('My baseline draft.', { exact: true })).toBeVisible();
    data.failSubmission = false; await page.getByRole('button', { name: 'Submit this activity' }).click();
    await expect(page.getByText('Activity submitted.', { exact: false })).toBeVisible();
    const submissions = data.calls.filter((call) => call.rpc === 'submit_study_activity');
    assert.equal(submissions.length, 2); assert.equal(submissions[0].body.p_request_id, submissions[1].body.p_request_id);
    assert.deepEqual(submissions[1].body.p_answers, { [questionId]: 'My baseline draft.', 'followup-question': 'More accessible booking.' });
  });
  await scenario('participant slide drafts preserve older copies and block overwriting a newer server draft', async ({ page, context, data }) => {
    const key = 'a'.repeat(64);
    const activities = [{ id: 'conflict-activity', title: 'Draft recovery', required: true, status: 'available', questions: data.questions }];
    data.participantStudy = { ...data.versions[0], version_id: versionId, activities, participant_reference: 'STUDY-TEST', study_status: 'open', reward_status: 'not_recorded' };
    data.activityProgress = { draft_answers: { [questionId]: 'Latest saved answer.' }, revision: 3 };
    await context.addInitScript(({ name, question }) => {
      sessionStorage.setItem(name, JSON.stringify({ answers: { [question]: 'Older unsaved answer.' }, base_revision: 1 }));
    }, { name: `eduthemes.activity-draft.${key.slice(-16)}.conflict-activity`, question: questionId });
    await page.goto(`${participantServer.url}/my-studies#access=${key}`);
    await page.getByRole('button', { name: 'Start activity' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('Latest saved answer.');
    await expect(page.getByRole('textbox')).toBeDisabled();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download the older copy' }).click();
    const download = await downloading;
    const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(backup.answers[questionId], 'Older unsaved answer.');
    await page.getByRole('button', { name: 'Continue with the saved draft' }).click();
    data.conflictOnDraft = true;
    await page.getByRole('textbox').fill('Keep this local edit.');
    await expect(page.getByRole('alert')).toContainText('A newer saved draft exists.');
    await expect(page.getByRole('textbox')).toHaveValue('Keep this local edit.');
    await expect(page.getByRole('button', { name: 'Review answers' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Download unfinished answers' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to saved activities', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your study progress' })).toBeVisible();
    assert.equal(data.activityProgress.draft_answers[questionId], 'Latest saved answer.');
  });
  await scenario('accepted coding decisions recover after a browser reload', async ({ page, context, data }) => {
    const dataset = [{ original: 'A clear appointment link helped.', submission_id: responseId, study_version_id: versionId, question_id: questionId, themes: [] }];
    await signIn(context, {
      'eduthemes.sessionId': 'test-session', 'eduthemes.dataset': dataset,
      'eduthemes.labels': [{ name: 'Clear guidance', description: 'Knowing what to do next' }],
      'eduthemes.claudeData': { 'Clear guidance': [0], Unclassified: [] },
      'eduthemes.analysisSource': { studyId, questionId, versionId, ownerId: owner, actorId: owner, runId: 'test-session', revision: 1, title: data.study.title, prompt: data.questions[0].prompt },
    });
    await page.goto(`${researcherServer.url}/review`);
    await page.getByRole('button', { name: 'Accept response 1', exact: true }).click();
    await expect(page.locator('.review-response-card.is-approved')).toHaveCount(1);
    await expect(page.getByRole('status', { name: 'Analysis save status', exact: true })).toHaveText('Saved');
    await page.reload();
    await expect(page.locator('.review-response-card.is-approved')).toHaveCount(1);
    assert.equal(data.analyses[0].coded_responses[0].review_decisions['Clear guidance'].action, 'approve');
  });
  await scenario('participant Canvas studies cannot submit with anonymous identity', async ({ page, data }) => {
    data.study.participant_mode = 'canvas';
    await page.goto(`${participantServer.url}/join/${code}`);
    await page.getByRole('button', { name: 'Start study' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('alert')).toContainText('requires verified Canvas details');
    await expect(page.getByRole('button', { name: 'Continue to questions' })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
  await scenario('participant blocked browser storage still permits anonymous submission and receipt download', async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { value: {
        getItem() { throw new Error('Storage denied'); }, setItem() { throw new Error('Storage denied'); }, removeItem() { throw new Error('Storage denied'); },
      } });
    });
    await page.goto(`${participantServer.url}/join/${code}`);
    await page.getByRole('button', { name: 'Start study' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByText('This browser cannot save your draft.', { exact: false })).toBeVisible();
    await page.getByRole('textbox').fill('My response is preserved until submission.');
    await page.getByRole('button', { name: 'Review answers' }).click();
    await page.getByRole('button', { name: 'Submit responses' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for participating' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download study receipt' })).toBeVisible();
  });
  await scenario('conflicting analysis saves remain visible and local coding can be downloaded', async ({ page, context, data }) => {
    data.conflictOnSave = true;
    await signIn(context, {
      'eduthemes.sessionId': 'conflict-session', 'eduthemes.dataset': [{ original: 'A clear appointment link helped.', themes: [] }],
      'eduthemes.labels': [{ name: 'Clear guidance' }], 'eduthemes.claudeData': { 'Clear guidance': [0], Unclassified: [] },
      'eduthemes.analysisSource': { studyId, questionId, versionId, ownerId: owner, actorId: owner, runId: 'conflict-session', revision: 1, title: data.study.title, prompt: data.questions[0].prompt },
    });
    await page.goto(`${researcherServer.url}/review`);
    await expect(page.getByText('Could not save study progress:', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Accept response 1', exact: true }).click();
    await expect(page.locator('.review-response-card.is-approved')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Download current coding' })).toBeVisible();
    await expect(page.getByText('Could not save study progress:', { exact: false })).toBeVisible();
  });
} finally {
  await browser.close();
  await Promise.all([new Promise((resolve) => researcherServer.server.close(resolve)), new Promise((resolve) => participantServer.server.close(resolve))]);
}
