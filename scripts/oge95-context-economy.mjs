/** Headroom-inspired opt-in experiment: reversible consecutive duplicate tool-log lines. */
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const critical=/(fail|error|denied|approval|authorized|secret|token|password|sha256|session|exception|permission|missing|blocked|http\s+[45]\d\d|[0-9a-f]{40})/i;
const digest=s=>createHash("sha256").update(s).digest("hex");
export function pack(source){
 if(typeof source!=="string"||source.length>400000)throw Error("INVALID_INPUT");
 const items=[];
 for(const line of source.split("\n")){
  const prev=items.at(-1);
  if(prev&&line===prev.line&&!critical.test(line))prev.count++;
  else items.push({line,count:1});
 }
 const preview=items.map(x=>x.count>1?x.line+" [repeated "+x.count+" times]":x.line).join("\n");
 return {schema:"OGE95_TOOL_LOG_DEDUPE_V1",source_sha256:digest(source),original_chars:source.length,
   preview_chars:preview.length,preview,items,context:"EPHEMERAL_TOOL_LOG_ONLY",canonical_state_mutated:false};
}
export function unpack(record){
 if(record?.schema!=="OGE95_TOOL_LOG_DEDUPE_V1")throw Error("INVALID_RECORD");
 const lines=record.items.flatMap(x=>{
  if(typeof x.line!=="string"||!Number.isInteger(x.count)||x.count<1||x.count>400000)throw Error("INVALID_ENTRY");
  return Array(x.count).fill(x.line);
 });
 const restored=lines.join("\n");
 if(digest(restored)!==record.source_sha256)throw Error("SOURCE_HASH_MISMATCH");
 return restored;
}
function main(){
 const fixture=["Source audit",...Array(200).fill("dependency already cached"),
  "ERROR: current SHA not verified","APPROVAL_REQUIRED"].join("\n");
 const packed=pack(fixture);
 if(unpack(packed)!==fixture)throw Error("NOT_RETRIEVABLE");
 const receipt={schema:"OGE95_CONTEXT_PILOT_V1",input:"SYNTHETIC_LOGS",
  before_chars:packed.original_chars,after_chars:packed.preview_chars,
  saved_chars:packed.original_chars-packed.preview_chars,
  reconstruction:"EXACT",actual_token_usage_measured:false,provider_calls:0,
  live_prompt_changed:false,green_d1_changed:false};
 writeFileSync("oge95-context-benchmark.json",JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
