// OpenAI Codex App Server official stdio JSONL handshake proof.
// No ChatGPT login, API token, agent inference, remote listener, host shell, production or paid usage.
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const home=mkdtempSync(join(tmpdir(),'wave-codex-app-server-'));
const env={...process.env,CODEX_HOME:home};
for(const key of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_ACCESS_TOKEN','CHATGPT_ACCESS_TOKEN']) delete env[key];
const result={schema:'wave.codex.app_server.stdio.v1',source:'learn.chatgpt.com/docs/app-server',transport:'stdio-jsonl',authenticated:false,model_inference:false,host:'GITHUB_HOSTED_CI_ONLY',cli_version:'UNVERIFIED',initialize:'UNTESTED',initialized_notification:'UNTESTED',thread_list:'UNTESTED',remote_ws_exposed:false,app_server_protocol_e2e:false,ocian_tmn_e2e:false};
let proc;
const outstanding=new Map();
let nextId=1;
let stderrBytes=0;
const send=(item)=>{if(!proc||!proc.stdin.writable)throw Error('APP_SERVER_NOT_WRITABLE');proc.stdin.write(JSON.stringify(item)+'\n')};
const call=(method,params,timeout=12000)=>new Promise((resolve,reject)=>{const id=nextId++;const timer=setTimeout(()=>{outstanding.delete(id);reject(Error('RPC_TIMEOUT_'+method))},timeout);outstanding.set(id,{resolve(x){clearTimeout(timer);resolve(x)},reject(x){clearTimeout(timer);reject(x)}});send({id,method,...(params===undefined?{}:{params})})});
try {
 const v=spawnSync('codex',['--version'],{encoding:'utf8',env,timeout:8000});
 if(v.status!==0)throw Error('CODEX_CLI_MISSING');
 result.cli_version=String(v.stdout||'').trim().slice(0,100);
 if(!/0\.164\.0/.test(result.cli_version))throw Error('CODEX_NOT_PINNED_0_164_0');
 proc=spawn('codex',['app-server','--listen','stdio://'],{env,stdio:['pipe','pipe','pipe']});
 proc.stderr.on('data',chunk=>{stderrBytes+=chunk.length});
 proc.on('exit',()=>{for(const w of outstanding.values())w.reject(Error('APP_SERVER_EXITED'));outstanding.clear()});
 const rl=createInterface({input:proc.stdout,crlfDelay:Infinity});
 rl.on('line',line=>{let item;try{item=JSON.parse(line)}catch{return}if(typeof item?.id==='number'&&outstanding.has(item.id)){const w=outstanding.get(item.id);outstanding.delete(item.id);w.resolve(item)}});
 // Official requirement: initialize once, then initialized notification. No requests before init.
 const init=await call('initialize',{clientInfo:{name:'wave_staging_contract_probe',title:'WAVE Staging Protocol Probe',version:'0.1.0'},capabilities:{experimentalApi:false}});
 if(init.error||!init.result)throw Error('INITIALIZE_FAILED');
 result.initialize='PASS';
 send({method:'initialized'});result.initialized_notification='SENT';
 // A read-only empty ephemeral store request, never create a thread or invoke inference.
 const threads=await call('thread/list',{limit:1});
 result.thread_list=threads.error?'RPC_ERROR_'+String(threads.error.code??'UNKNOWN').slice(0,24):'PASS';
 result.app_server_protocol_e2e=result.initialize==='PASS'&&result.thread_list==='PASS'&&Array.isArray(threads.result?.data);
 if(!result.app_server_protocol_e2e)throw Error('THREAD_LIST_READBACK_NOT_PROVEN');
} catch(error){result.failure=String(error?.message||'ERROR').slice(0,100)}
finally {for(const w of outstanding.values())w.reject(Error('PROBE_SHUTDOWN'));outstanding.clear();if(proc){proc.stdin.end();proc.kill('SIGTERM')}rmSync(home,{recursive:true,force:true})}
console.log('WAVE_CODEX_APP_SERVER_STDIO_PROOF='+JSON.stringify(result));
console.log('NO_MODEL_INFERENCE_NO_OPENAI_API_SPEND_NO_WEBSOCKET_NO_OCIAN_HOST=TRUE');
if(!result.app_server_protocol_e2e)process.exitCode=35;
