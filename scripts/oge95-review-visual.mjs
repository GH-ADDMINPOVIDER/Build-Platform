/** OGE95: purely source-grounded review diagram, no third-party tools. */
import {readFileSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const BRANCH="phase-vi-provider-incentive-metering";
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const mapping=[
 [/^(src\/|public\/|index\.html$)/,["WAVE"]],
 [/^worker\/(athena|blue-diamond)/,["ATHENA_BLUE"]],
 [/^worker\/(yellow|capability|maop|ccs)/,["YELLOW_MAOP","CCS"]],
 [/^worker\/(violet|agent-task|workflow-engine)/,["VIOLET"]],
 [/^worker\/(ruby|verification)/,["RUBY"]],
 [/^worker\/(unified-chat|1lss|session)/,["GREEN_1LSS"]],
 [/^(\.github\/|scripts\/oge95-)/,["GITHUB"]],
 [/^config\/oge95-rules-center\.json$/,["YELLOW_MAOP"]]
];
export function analyze(paths,graph){
 if(!Array.isArray(graph?.nodes)||!Array.isArray(graph?.edges)||!Array.isArray(graph?.first_view_flow))throw Error("INVALID_GRAPH");
 const ids=new Set(graph.nodes.map(n=>n.id)),selected=new Set(),unmapped=[];
 const changed=[...new Set(paths)].sort();
 if(changed.length>200)throw Error("TOO_MANY_FILES");
 for(const path of changed){
  if(typeof path!=="string"||path.length>250||!/^[-\w./ ]+$/.test(path)||path.startsWith("/")||path.includes(".."))throw Error("INVALID_PATH");
  const entry=mapping.find(([re])=>re.test(path));
  if(!entry){unmapped.push(path);continue}
  entry[1].forEach(id=>{if(ids.has(id))selected.add(id)});
 }
 const flow=graph.first_view_flow;
 if(!flow.every(id=>ids.has(id)))throw Error("UNKNOWN_FLOW_NODE");
 const allowed=new Set(graph.edges.map(e=>e[0]+"->"+e[1]));
 return {schema:"OGE95_SOURCE_REVIEW_V1",branch:BRANCH,changed_paths:changed,
  candidate_nodes:[...selected].sort(),unmapped,flow,
  edges:flow.slice(1).map((to,i)=>[flow[i],to]).filter(e=>allowed.has(e.join("->"))),
  source:"docs/architecture/oge-system-edges.json",runtime_verified:false,review_required:true};
}
export function svg(report,graph){
 const labels=new Map(graph.nodes.map(n=>[n.id,n.label]));
 const height=110+report.flow.length*91;
 const body=['<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="'+height+'" viewBox="0 0 1040 '+height+'" role="img">',
  '<title>WAVE source review (not runtime proof)</title><rect width="100%" height="100%" fill="#fff"/>',
  '<text x="40" y="41" font-family="Arial" font-weight="bold" font-size="24">WAVE REVIEW IMPACT MAP</text>'];
 report.flow.forEach((id,i)=>{
  const y=58+i*91,hit=report.candidate_nodes.includes(id);
  body.push('<rect x="40" y="'+y+'" width="960" height="67" rx="8" stroke="#444" fill="'+(hit?"#111":"#f4f4f4")+'"/>');
  body.push('<text x="60" y="'+(y+27)+'" font-family="Arial" font-size="18" fill="'+(hit?"#fff":"#111")+'">'+esc(id)+'</text>');
  body.push('<text x="60" y="'+(y+50)+'" font-family="Arial" font-size="14" fill="'+(hit?"#fff":"#555")+'">'+esc(labels.get(id)||id)+'</text>');
  if(i<report.flow.length-1&&report.edges.some(e=>e[0]===id&&e[1]===report.flow[i+1]))
   body.push('<path d="M520 '+(y+67)+' v24" stroke="#666" fill="none" stroke-width="2"/>');
 });
 body.push('<text x="40" y="'+(height-30)+'" font-family="Arial" font-size="14">Dark nodes = candidates by file path. Edges = existing source graph. NOT a verified execution flow.</text></svg>');
 return body.join("\n")+"\n";
}
export function markdown(report){
 const fence="\x60\x60\x60";
 return ["# OGE95 source-impact diagram (review only)",fence+"mermaid","flowchart TD",
 ...report.flow.map(x=>"  "+x+'["'+x+'"]'),
 ...report.edges.map(e=>"  "+e[0]+" --> "+e[1]),fence,
 "Candidate nodes: "+(report.candidate_nodes.join(", ")||"none"),
 "Unmapped files: "+(report.unmapped.join(", ")||"none"),
 "This does not prove new data-flow edges, bugs, tests, or deployments."].join("\n")+"\n";
}
function main(){
 const base=process.argv[2]||"HEAD~1";
 if(base!=="HEAD~1"&&!/^[0-9a-f]{40}$/i.test(base))throw Error("INVALID_BASE");
 if(execFileSync("git",["branch","--show-current"],{encoding:"utf8"}).trim()!==BRANCH)throw Error("STAGING_ONLY");
 const files=execFileSync("git",["diff","--name-only","--diff-filter=ACDMRT",base,"HEAD"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
 const graph=JSON.parse(readFileSync("docs/architecture/oge-system-edges.json","utf8"));
 const r=analyze(files,graph);r.head_sha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 writeFileSync("oge95-review-impact.json",JSON.stringify(r,null,2)+"\n");
 writeFileSync("oge95-review-impact.svg",svg(r,graph));
 writeFileSync("oge95-review-impact.md",markdown(r));
 console.log(JSON.stringify({result:"SOURCE_REVIEW_READY",head:r.head_sha,files:files.length,unknown:r.unmapped.length,provider_calls:0}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
