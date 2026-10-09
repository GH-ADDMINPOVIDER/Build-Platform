import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

const source = readFileSync(new URL("../worker/violet-distribution-planner.ts", import.meta.url), "utf8");
const js = transpileModule(source, {
  compilerOptions: {module:ModuleKind.ESNext,target:ScriptTarget.ES2022},
}).outputText;
const { planVioletDistribution } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

const actor = (id, capabilities, overrides={}) => ({
  actor_id:id, label:id, provider:id, actor_class:"execution_agent",
  agent_eligible:true, maturity:"PROVEN", state:"LIVE",
  auth_ref:"SERVER_SIDE_REFERENCE_PRESENT", priority:3,
  runtime:"TEST_RUNNER", capabilities, ...overrides,
});
const blue = [
  actor("codex-execution-agent",["read_file","write_file","test","build"]),
  actor("deepseek-candidate",["reasoning","context_load"],{priority:8}),
  actor("gemini-candidate",["reasoning","context_load"],{priority:10,state:"DEGRADED"}),
  actor("manus-candidate",["research","app_build"],{priority:5,maturity:"CANDIDATE",state:"DEGRADED"}),
  actor("github-evidence-arm",["read_file"],{agent_eligible:false,actor_class:"tool",maturity:"TOOL_ONLY",priority:1}),
];
const req = (tasks,extra={}) => ({tasks,max_parallel:3,...extra});

test("Violet delegates only matched, verified Blue execution agents without executing",()=>{
  const res=planVioletDistribution(req([
    {task_id:"OGE-96",capability:"read_file"},
    {task_id:"OGE-97",capability:"reasoning"},
  ]),blue,[],true);
  assert.equal(res.ok,true);
  assert.deepEqual(res.assignments.map(a=>a.agent_id),["codex-execution-agent","deepseek-candidate"]);
  assert.equal(res.planning_only,true);
  assert.equal(res.persisted,false);
  assert.equal(res.execution_authority,"YELLOW_STONE_ONLY");
  assert.ok(res.assignments.every(a=>a.auto_executed===false&&a.ready_to_execute===false));
});
test("candidate and non-agent tool identities never become execution assignees",()=>{
  const res=planVioletDistribution(req([
    {task_id:"OGE-97",capability:"research"},
    {task_id:"OGE-98",capability:"read_file",preferred_agent_id:"github-evidence-arm"},
  ]),blue,[],true);
  assert.equal(res.planned_count,0);
  assert.equal(res.queue[0].status,"BLOCKED_UNVERIFIED_AGENT");
  assert.equal(res.queue[1].status,"BLOCKED_NO_BLUE_CAPABILITY");
});
test("existing Codex claim blocks a parallel collision, never assigns the same agent twice",()=>{
  const res=planVioletDistribution(req([
    {task_id:"OGE-98",capability:"write_file"},
    {task_id:"OGE-99",capability:"read_file"},
  ]),blue,[{claimed_by:"codex-cto",status:"RUNNING"}],true);
  assert.equal(res.planned_count,0);
  assert.deepEqual(res.queue.map(t=>t.status),["QUEUED_AGENT_BUSY","QUEUED_AGENT_BUSY"]);
});
test("an agent receives at most one concurrent plan slot",()=>{
  const res=planVioletDistribution(req([
    {task_id:"OGE-96",capability:"read_file"},
    {task_id:"OGE-97",capability:"test"},
  ]),blue,[],true);
  assert.equal(res.planned_count,1);
  assert.equal(res.queue[0].status,"QUEUED_AGENT_BUSY");
});
test("stale or unavailable D1 capacity fails closed before assigning",()=>{
  const res=planVioletDistribution(req([{task_id:"OGE-96",capability:"read_file"}]),blue,[],false);
  assert.equal(res.planned_count,0);
  assert.equal(res.queue[0].status,"BLOCKED_D1_CAPACITY_UNVERIFIED");
});
test("DEGRADED means Blue preflight required, not LIVE verified",()=>{
  const res=planVioletDistribution(req([{task_id:"OGE-99",capability:"context_load",
    preferred_agent_id:"gemini-candidate"}]),blue,[],true);
  assert.equal(res.assignments[0].status,"PLANNED_BLUE_PREFLIGHT_REQUIRED");
  assert.equal(res.assignments[0].ready_to_execute,false);
});
test("parallel limit and sequential dependencies remain bounded",()=>{
  const tasks=[
    {task_id:"OGE-96",capability:"read_file"},
    {task_id:"OGE-97",capability:"reasoning"},
  ];
  const parallel=planVioletDistribution(req(tasks,{max_parallel:1}),blue,[],true);
  assert.equal(parallel.planned_count,1);
  assert.equal(parallel.queue[0].status,"QUEUED_PARALLEL_LIMIT");
  const sequential=planVioletDistribution(req(tasks,{strategy:"sequential"}),blue,[],true);
  assert.equal(sequential.planned_count,1);
  assert.deepEqual(sequential.queue[0].depends_on,["OGE-96"]);
});
test("invalid or duplicate ids and oversize queue are rejected",()=>{
  for(const tasks of [
    [{task_id:"OGE-96",capability:"read_file"},{task_id:"OGE-96",capability:"reasoning"}],
    [{task_id:"x",capability:"../secrets"}],
    Array.from({length:11},(_,i)=>({task_id:"t"+i,capability:"read_file"})),
    [],
  ]){
    const result=planVioletDistribution(req(tasks),blue,[],true);
    assert.equal(result.ok,false);
    assert.equal(result.http_status,400);
  }
});
