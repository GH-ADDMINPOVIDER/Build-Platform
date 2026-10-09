// OGE-111: deterministic skill recall, not an AI provider or a memory database.
export type Skill = {id:string;description:string;agent_skill_path:string;source_sha256:string};
const families=[
 {id:"session_memory",terms:/session|memory|remember|recall|context|handoff|ความจำ|บริบท|เซสชัน|จำ|ส่งต่อ/i,skills:["recall","why"],principles:["principle-guard-the-context-window","principle-encode-lessons-in-structure"],capability:"context_load"},
 {id:"multi_agent",terms:/swarm|agent|parallel|multi.model|delegate|ทีม|หลายตัว|ขนาน|กระจายงาน/i,skills:["swarm","interrogate"],principles:["principle-separate-before-serializing-shared-state","principle-sequence-verifiable-units"],capability:"reasoning"},
 {id:"bug_fix",terms:/bug|fix|failed|failure|crash|error|broken|บั๊ก|แก้|พัง|ล้มเหลว/i,skills:["figure-it-out","correct"],principles:["principle-fix-root-causes","principle-test-behavior-not-implementation"],capability:"test"},
 {id:"verification",terms:/test|verify|proof|ci|audit|evidence|ruby|ตรวจ|พิสูจน์|ทดสอบ|หลักฐาน/i,skills:["create-verification-skill","maintain-verification-skill"],principles:["principle-prove-it-works","principle-test-behavior-not-implementation"],capability:"runtime_verify"},
 {id:"architecture",terms:/design|architect|api|layer|structure|stone|ระบบ|ออกแบบ|โครงสร้าง/i,skills:["architect","how"],principles:["principle-foundational-thinking","principle-model-the-domain"],capability:"read_file"},
 {id:"review",terms:/review|pr\b|security|risk|challenge|ตรวจโค้ด|รีวิว|ความเสี่ยง/i,skills:["interrogate","blast-radius"],principles:["principle-prove-it-works","principle-boundary-discipline"],capability:"code_review"},
 {id:"performance",terms:/performance|speed|latency|benchmark|quota|cost|เร็ว|ช้า|ต้นทุน|เครดิต/i,skills:["benchmark-checklist","show-me-your-work"],principles:["principle-explain-the-number","principle-build-the-lever"],capability:"test"},
 {id:"user_experience",terms:/mobile|iphone|ui|ux|website|app|button|มือถือ|หน้าเว็บ|ปุ่ม|ดีไซน์/i,skills:["create-verification-skill","architect"],principles:["principle-experience-first","principle-exhaust-the-design-space"],capability:"runtime_verify"},
 {id:"documentation",terms:/document|explain|teach|write|docs|คู่มือ|อธิบาย|เขียน|สอน/i,skills:["teach","technical-writing"],principles:["principle-minimize-reader-load","principle-prove-it-works"],capability:"read_file"}
];
function explicitSkill(input:string,id:string){
 const escaped=id.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&");
 return new RegExp("(^|[^a-z0-9-])"+escaped+"(?=$|[^a-z0-9-])","i").test(input);
}
export function selectPstackSkillStack(task:unknown,library:Skill[]){
 if(typeof task!=="string"||task.trim().length<3||task.length>600)return {ok:false as const,code:"TASK_REQUIRED_OR_TOO_LONG"};
 const input=task.trim(),byId=new Map(library.map(x=>[x.id,x]));
 const named=library.find(x=>explicitSkill(input,x.id));
 const family=families.find(x=>x.terms.test(input))||families.find(x=>x.id==="architecture")!;
 const primary=[...(named&&!named.id.startsWith("principle-")?[named.id]:[]),...family.skills];
 const principles=[...(named?.id.startsWith("principle-")?[named.id]:[]),...family.principles];
 const chosen=[...new Set(primary)].filter(x=>byId.has(x)).slice(0,3)
  .concat([...new Set(principles)].filter(x=>byId.has(x)).slice(0,2));
 return {ok:true as const,family:family.id,capability:family.capability,
  selected:chosen.map(id=>({id,path:byId.get(id)!.agent_skill_path,hash:byId.get(id)!.source_sha256})),
  source_state:"VERSIONED_GITHUB_SKILL_REFERENCE",provider_memory:"NOT_VERIFIED",
  execution_state:"NOT_DISPATCHED",total_library:library.length};
}
export function planSkillLearning(library:Skill[]){
 const arranged=[...library].sort((a,b)=>Number(a.id.startsWith("principle-"))-Number(b.id.startsWith("principle-"))||a.id.localeCompare(b.id));
 const waves=[];
 for(let i=0;i<arranged.length;i+=9)waves.push({wave:waves.length+1,source_refs:arranged.slice(i,i+9).map(x=>({id:x.id,path:x.agent_skill_path,hash:x.source_sha256})),read_receipt:"NOT_VERIFIED"});
 return {skill_count:library.length,waves,learning_state:"NOT_DISPATCHED",ruby_receipt:"NOT_VERIFIED",green_retention:"NOT_WRITTEN",new_memory_database:false};
}
