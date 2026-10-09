// OGE-112: rule-owned skill taxonomy, consumed by Violet. No inference, no provider dispatch.
export function classifyPstackIntent(task:unknown, metadata:{task_categories:Record<string,{label_th:string;pattern:string}>;skills:Array<{number:number;id:string;kind:string;categories:string[];sha256:string;source_path:string}>}){
  if(typeof task!=="string"||task.trim().length<3||task.length>600)return {ok:false as const,code:"TASK_REQUIRED_OR_TOO_LONG"};
  const input=task.trim(), hits=Object.entries(metadata.task_categories).filter(([_,entry])=>new RegExp(entry.pattern,"i").test(input)).map(([id])=>id);
  const categoryIds=hits.slice(0,3),needsClarification=categoryIds.length===0||hits.length>3;
  const count=Object.fromEntries(metadata.skills.map(s=>[s.id,s.number]));
  return {ok:true as const, categories:categoryIds, matched_count:hits.length,needs_clarification:needsClarification,
    decision_quality:needsClarification?"AMBIGUOUS_NEEDS_HUMAN_OR_FURTHER_CONTEXT":"RULE_MATCH",
    pstack_number_index_available:Object.keys(count).length,
    execution_state:"NOT_DISPATCHED",rule_authority:"RULE_STONE_07",skill_selection_owner:"VIOLET_STONE_04",
    source_hashes_required:true};
}
export function numberPstackSkills(ids:string[],metadata:{skills:Array<{number:number;id:string;sha256:string;categories:string[]}>}){
 const byId=new Map(metadata.skills.map(s=>[s.id,s]));
 return ids.map(id=>byId.get(id)).filter((s):s is NonNullable<typeof s>=>Boolean(s)).map(s=>({
  number:s.number,id:s.id,hash:s.sha256,categories:s.categories
 }));
}

export function choosePstackCategoryStack(task:unknown,metadata:{
 task_categories:Record<string,{label_th:string;pattern:string;recommended_workflow_numbers:number[];recommended_principle_numbers:number[];blue_required_capability:string}>;
 skills:Array<{number:number;id:string;kind:string;categories:string[];sha256:string;source_path:string}>;
},explicitCategory?:unknown){
 const classification=classifyPstackIntent(task,metadata);
 if(!classification.ok)return {ok:false as const,code:classification.code};
 const selectedCategory=typeof explicitCategory==="string"&&explicitCategory.trim()?explicitCategory.toUpperCase():classification.categories[0];
 if(!selectedCategory||!metadata.task_categories[selectedCategory])return {ok:false as const,code:"TASK_CATEGORY_NEEDS_CLARIFICATION",suggested_categories:classification.categories};
 const cat=metadata.task_categories[selectedCategory],numbers=[...cat.recommended_workflow_numbers,...cat.recommended_principle_numbers];
 if(numbers.length>5||new Set(numbers).size!==numbers.length)return {ok:false as const,code:"INVALID_CATEGORY_DEFAULTS"};
 const selected=numbers.map(n=>metadata.skills[n-1]).filter(x=>x&&x.categories.includes(selectedCategory))
   .map(x=>({id:x.id,path:x.source_path,hash:x.sha256,number:x.number,kind:x.kind}));
 if(selected.length!==numbers.length)return {ok:false as const,code:"CATEGORY_SKILL_REFERENCE_MISMATCH"};
 return {ok:true as const,category:selectedCategory,category_th:cat.label_th,
  matched_categories:classification.categories,needs_clarification:classification.needs_clarification,
  selected,capability:cat.blue_required_capability,decision_basis:"RULE_STONE_CURATED_NUMBERS",
  rule_authority:"RULE_STONE_07",execution_state:"NOT_DISPATCHED",source_hashes_required:true};
}
