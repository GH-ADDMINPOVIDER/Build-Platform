#!/usr/bin/env node
// OGE-110: source-only portable pstack import. DO NOT RUN ANY VENDORED CODE.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const ROOT=process.cwd();
const SOURCE=path.resolve(process.argv[2] || ".pstack-vendor-source");
const VENDOR=path.join(ROOT,"third_party","pstack-portable");
const SKILLS=path.join(ROOT,".agents","skills");
const PIN="3a604672c46cd8187d2b19980eae0a34f9f91138";
const UPSTREAM="ccb5507cec1546dc88135c1139c811e6c59115ba";
const EXPECTED_SKILLS=51, EXPECTED_AGENTS=2;
const ROOT_ENTRIES=[".cursor-plugin",".gitignore","LICENSE","MIRROR.md","README.md","agents","assets","automations","docs","skills"];
const fail=(message)=>{throw new Error("OGE110_IMPORT_DENIED: "+message)};
if (!fs.existsSync(path.join(SOURCE,"LICENSE"))) fail("portable source missing");
const sourceLicense=fs.readFileSync(path.join(SOURCE,"LICENSE"),"utf8");
if (!/MIT License/.test(sourceLicense)||!/Lauren Tan/.test(sourceLicense)) fail("MIT provenance mismatch");
const sha=x=>crypto.createHash("sha256").update(fs.readFileSync(x)).digest("hex");
function inspect(root) {
  if (fs.lstatSync(root).isSymbolicLink()) fail("symlink is forbidden: "+root);
  if (fs.statSync(root).isDirectory()) for(const name of fs.readdirSync(root)) inspect(path.join(root,name));
  else if (!fs.statSync(root).isFile()) fail("unexpected node: "+root);
}
for (const name of ROOT_ENTRIES) inspect(path.join(SOURCE,name));
const originalSkills=fs.readdirSync(path.join(SOURCE,"skills"),{withFileTypes:true}).filter(x=>x.isDirectory()&&fs.existsSync(path.join(SOURCE,"skills",x.name,"SKILL.md"))).map(x=>x.name).sort();
const originalAgents=fs.readdirSync(path.join(SOURCE,"agents")).filter(x=>x.endsWith(".md")).sort();
if (originalSkills.length!==EXPECTED_SKILLS||originalAgents.length!==EXPECTED_AGENTS) fail("unexpected skill/agent inventory");
if (fs.existsSync(SKILLS)) for (const id of originalSkills) {
  const dest=path.join(SKILLS,id);
  if (fs.existsSync(dest) && !fs.existsSync(path.join(VENDOR,"skills",id,"SKILL.md"))) fail("existing first-party skill collision: "+id);
}
fs.mkdirSync(VENDOR,{recursive:true});
for(const name of ROOT_ENTRIES){
  fs.rmSync(path.join(VENDOR,name),{recursive:true,force:true});
  fs.cpSync(path.join(SOURCE,name),path.join(VENDOR,name),{recursive:true,dereference:false,force:true});
}
fs.mkdirSync(SKILLS,{recursive:true});
for(const id of originalSkills){
  const out=path.join(SKILLS,id);
  fs.rmSync(out,{recursive:true,force:true});
  fs.cpSync(path.join(SOURCE,"skills",id),out,{recursive:true,dereference:false,force:true});
}
function nonExecutable(root){
  if(fs.statSync(root).isDirectory())for(const name of fs.readdirSync(root))nonExecutable(path.join(root,name));
  else fs.chmodSync(root,0o644); // Even bundled upstream scripts are data; never auto-run.
}
nonExecutable(VENDOR);
for(const id of originalSkills)nonExecutable(path.join(SKILLS,id));
const items=originalSkills.map(id=>{
  const original=path.join(SOURCE,"skills",id,"SKILL.md");
  if(sha(original)!==sha(path.join(SKILLS,id,"SKILL.md")))fail("skill checksum mismatch: "+id);
  const body=fs.readFileSync(original,"utf8");
  const top=body.startsWith("---")?body.slice(3,body.indexOf("---",3)):"";
  const desc=(top.match(/^description:\s*(.*)$/m)?.[1]||"").replace(/^['"]|['"]$/g,"").slice(0,500);
  return {id,description:desc,source_path:"third_party/pstack-portable/skills/"+id+"/SKILL.md",agent_skill_path:".agents/skills/"+id+"/SKILL.md",source_sha256:sha(original),source_state:"IMPORTED_NOT_EXECUTED"};
});
const manifest={
  schema_version:"1.0",kind:"VIOLET_PSTACK_PORTABLE_SOURCE",
  owner_stone:"VIOLET_STONE_04",authority_stone:"YELLOW_STONE",verifier_stone:"RUBY_STONE",memory:"owner-main / 1LSS_OWNER_MAIN",
  github_source:"https://github.com/backnotprop/pstack",pin_commit:PIN,upstream:"https://github.com/cursor/plugins/tree/main/pstack",upstream_reference_commit:UPSTREAM,
  license:"MIT",skill_count:items.length,agent_definition_count:originalAgents.length,
  vendor_complete:true,compatible_agent_skill_layout:true,provider_calls_triggered_by_import:0,
  execution_state:"NOT_DISPATCHED",automation_state:"INERT_SOURCE_ONLY",full_native_cursor_plugin_installed:false,
  skills:items
};
fs.mkdirSync(path.join(ROOT,"config"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"config","pstack-full-catalog.json"),JSON.stringify(manifest,null,2)+"\n");
const receipt={status:"IMPORTED_SOURCE_ONLY",commit:PIN,skills:items.length,agents:originalAgents.length,automation:"INERT",provider_calls:0};
console.log("OGE110_VENDOR_IMPORT "+JSON.stringify(receipt));
