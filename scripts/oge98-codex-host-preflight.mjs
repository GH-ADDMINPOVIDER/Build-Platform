// OGE-98 — read-only self-host Codex execution prerequisites, NOT a real agent task.
// Never requests provider credentials, sends prompts, executes Codex tasks, writes D1 or deploys.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const repo="GH-ADDMINPOVIDER/Build-Platform";
const branch="Unified-on-Progress";
function probe(command,args,timeout=12000) {
  try {
    const data=execFileSync(command,args,{
      encoding:"utf8",timeout,maxBuffer:32000,
      env:{...process.env,GIT_TERMINAL_PROMPT:"0"},
      stdio:["ignore","pipe","pipe"]
    });
    return {ok:true,out:String(data).trim().slice(0,120)};
  } catch {return {ok:false,out:""};}
}
const sha=String(process.env.GITHUB_SHA||"");
if(process.env.GITHUB_REPOSITORY!==repo || process.env.GITHUB_REF_NAME!==branch ||
   !/^[a-f0-9]{40}$/.test(sha)) throw Error("OGE98_CANONICAL_STAGING_CONTEXT_REQUIRED");
const head=probe("git",["rev-parse","HEAD"]);
if(!head.ok || head.out!==sha)throw Error("OGE98_SOURCE_SHA_DRIFT");
const codex=probe("codex",["--version"]);
const server=codex.ok?probe("codex",["exec-server","--help"]):{ok:false};
const remote=probe("git",["remote","get-url","origin"]);
const access=remote.ok?probe("git",["ls-remote","--exit-code","origin","HEAD"]):{ok:false};
const result={
  schema_version:"OGE98_CODEX_HOST_PREFLIGHT_V1",
  source_sha:sha,
  repository:repo,branch,
  execution_host:"EXISTING_SELF_HOSTED_GITHUB_Unifiend",
  codex_cli_present:codex.ok,
  codex_exec_server_help_available:server.ok,
  git_remote_configured:remote.ok,
  git_remote_read_access:access.ok,
  paid_agent_calls:0,agent_task_dispatched:false,
  credentials_probed:false,
  actual_scoped_codex_change_proven:false,
  independent_ruby_verdict_present:false,
  ready_for_agent_dispatch:codex.ok&&server.ok&&access.ok,
  status:codex.ok&&server.ok&&access.ok?"HOST_PREREQUISITES_READY_ONLY":"HOST_PREREQUISITES_BLOCKED",
  ready_to_close_oge98:false
};
writeFileSync("oge98-codex-host-preflight.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
