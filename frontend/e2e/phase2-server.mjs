// Local manual walkthrough: real disposable PostgreSQL and both production builds.
// No production services, credentials, or participant records are used.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = path.join(root, 'frontend');
const participant = path.resolve(root, '../EduThemes-Participant');
const apiUrl = 'http://127.0.0.1:5182';
const researcherUrl = 'http://127.0.0.1:5180';
const participantUrl = 'http://127.0.0.1:5181';
const output = path.join(frontend, 'test-results/phase2');
const owner = randomUUID();
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated;`);
for (const migration of ['202610090001_studies.sql','202610240001_canvas_lti.sql','202610280001_teams_versions_consent.sql','202610280002_study_operations_activities.sql']) {
  await db.exec(await readFile(path.join(root,'supabase/migrations',migration),'utf8'));
}
await db.query('insert into auth.users values ($1,$2,now())',[owner,'owner@example.invalid']);
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[owner]);
const seeded = (await db.query(`select public.save_study_draft(null,$1,0) as id`,[{
  title:'DEMO ONLY — two-activity study', research_question:'Can participants return and complete a follow-up?',
  description:'Synthetic local walkthrough. No real research data.', participant_mode:'anonymous',
  consent_text:'This is a software verification using fabricated answers. No real participant is taking part. Do not enter personal information.',
  contact_info:'Demo study coordinator', compensation_details:'No compensation. Local software test only.',
  activities:[{title:'Baseline',kind:'baseline',required:true,opens_after_days:0,due_after_days:1,questions:['What helped in the sample advising experience?']},
    {title:'Follow-up',kind:'followup',required:true,opens_after_days:0,due_after_days:2,questions:['What changed in the sample experience?']}],
}])).rows[0].id;
await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
const code = (await db.query('select share_code from public.studies where id=$1',[seeded])).rows[0].share_code;

const fixtureEnv = { ...process.env, VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_local',
  VITE_SUPABASE_ANON_KEY:'sb_publishable_synthetic_local', VITE_API_URL:apiUrl, VITE_PARTICIPANT_URL:participantUrl };
for (const [project, directory] of [[frontend,path.join(output,'researcher')],[participant,path.join(output,'participant')]]) {
  execFileSync(process.execPath,[path.join(project,'node_modules/vite/bin/vite.js'),'build','--outDir',directory,'--emptyOutDir'],{cwd:project,env:fixtureEnv,stdio:'inherit'});
}

const user = {id:owner,email:'owner@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{}};
const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:owner,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.c3ludGhldGlj`;
const tables = new Set(['studies','study_questions','study_submissions','study_analyses','study_versions','study_members']);
const functions = new Set(['study_role','pending_study_invitations','invite_study_member','accept_study_invitation','remove_study_member',
  'save_study_draft','get_public_study','submit_study_version','get_study_receipt','save_study_analysis',
  'get_study_operations','save_study_operations','update_participation_reward','get_participant_study','enroll_study',
  'start_study_activity','save_activity_draft','submit_study_activity']);
const identifier = (value) => { if(!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Unsupported test identifier'); return `"${value}"`; };
let queue = Promise.resolve();
function queryAs(authenticated, fn) {
  const result = queue.catch(()=>{}).then(async()=>{
    await db.exec(`set role ${authenticated?'authenticated':'anon'}`);
    try { await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[authenticated?owner:'']); return await fn(); }
    finally { await db.exec('reset role'); }
  }); queue=result; return result;
}
const api = createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,accept,accept-profile,content-profile');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.end();return;}
  const reply=(value,status=200)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  try {
    const url=new URL(req.url,apiUrl);
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const raw=Buffer.concat(chunks).toString(); const body=raw?JSON.parse(raw):{};
    if(url.pathname==='/auth/v1/token')return reply({access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'synthetic-local-refresh',user});
    if(url.pathname==='/auth/v1/user')return reply(user);
    if(url.pathname==='/auth/v1/logout')return reply({});
    if(url.pathname==='/models')return reply({models:{navigator:true}});
    if(url.pathname==='/__test__/snapshot') {
      await queue.catch(()=>{});
      const result={};
      for(const table of ['studies','study_versions','study_submissions','study_activity_progress'])result[table]=(await db.query(`select * from public.${table}`)).rows;
      result.enrollments=(await db.query('select id,study_id,study_version_id,participant_reference,reward_status,revision from public.study_enrollments')).rows;
      return reply(result);
    }
    const authenticated=req.headers.authorization===`Bearer ${token}`;
    await new Promise(resolve=>setTimeout(resolve,200));
    if(url.pathname.startsWith('/rest/v1/rpc/')){
      const name=url.pathname.split('/').at(-1); if(!functions.has(name))throw new Error('Unsupported test RPC');
      const entries=Object.entries(body);
      const result=await queryAs(authenticated,()=>db.query(`select public.${identifier(name)}(${entries.map(([key],index)=>`${identifier(key)} => $${index+1}`).join(',')}) as value`,entries.map(([,value])=>value)));
      return reply(result.rows[0].value);
    }
    if(url.pathname.startsWith('/rest/v1/')){
      const table=url.pathname.split('/').at(-1);if(!tables.has(table))throw new Error('Unsupported test table');
      const params=[]; const conditions=[];
      for(const [key,value] of url.searchParams)if(!['select','order'].includes(key)){
        if(!value.startsWith('eq.'))throw new Error('Unsupported test filter');
        params.push(value.slice(3));conditions.push(`${identifier(key)}=$${params.length}`);
      }
      const where=conditions.length?' where '+conditions.join(' and '):'';
      const select=url.searchParams.get('select') || '*';
      const columns=select==='*'?'*':select.split(',').map(identifier).join(',');
      let sql;
      if(req.method==='PATCH'){
        const assignments=Object.entries(body).map(([key,value])=>{params.push(value);return `${identifier(key)}=$${params.length}`;});
        sql=`update public.${identifier(table)} set ${assignments.join(',')}${where} returning ${columns}`;
      }else{
        const order=url.searchParams.get('order');const sort=order?order.split(',').map(item=>{const [column,direction]=item.split('.');return `${identifier(column)} ${direction==='desc'?'desc':'asc'}`;}).join(','):'';
        sql=`select ${columns} from public.${identifier(table)}${where}${sort?' order by '+sort:''}`;
      }
      const result=await queryAs(authenticated,()=>db.query(sql,params));
      return reply(req.headers.accept?.includes('vnd.pgrst.object')?result.rows[0] || null:result.rows);
    }
    return reply({message:'Unknown local fixture route'},404);
  }catch(error){reply({message:error.message,code:error.code || 'LOCAL_FIXTURE'},({PT401:401,PT409:409,PT412:412,PT422:422,'42501':403})[error.code] || 400);}
});
async function serve(directory,port){
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');let file=path.resolve(directory,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(directory+path.sep))file=path.join(directory,'index.html');
    let data;try{data=await readFile(file);}catch{file=path.join(directory,'index.html');data=await readFile(file);}
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'})[path.extname(file)] || 'application/octet-stream');res.end(data);
  });await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return server;
}
await new Promise(resolve=>api.listen(5182,'127.0.0.1',resolve));
const sites=[await serve(path.join(output,'researcher'),5180),await serve(path.join(output,'participant'),5181)];
console.log(JSON.stringify({researcher:researcherUrl,participant:participantUrl,studyId:seeded,code,signIn:'owner@example.invalid / demo-only'}));
process.on('SIGINT',async()=>{api.close();for(const site of sites)site.close();await db.close();process.exit(0);});
