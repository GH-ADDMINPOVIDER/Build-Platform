import { writeFileSync } from "node:fs";
const env=process.env;
if(!env.ACTIONS_ID_TOKEN_REQUEST_URL||!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||!env.INFISICAL_IDENTITY_ID||!env.INFISICAL_ORG_ID||!env.INFISICAL_ORG_SLUG){
 console.log("AUDIT_BLOCKER=MISSING_OIDC_CONTEXT");process.exit(86);
}
if(env.GITHUB_REPOSITORY!=="Ogenicchocolate21debug/Build-Platform"||
 env.GITHUB_REF!=="refs/heads/phase-vi-provider-incentive-metering"||env.RUNNER_NAME!=="wave-runner-01"){
 console.log("AUDIT_BLOCKER=TRUST_SCOPE");process.exit(86);
}
const categories=[
["GitHub",/(^|_)(GITHUB|GIT_HUB|GH_TOKEN|GH_PAT|GH_APP)(_|$)/],
["Vercel",/(^|_)VERCEL(_|$)/],["Railway",/(^|_)RAILWAY(_|$)/],
["Lovable",/(^|_)LOVABLE(_|$)/],["OpenAI / Codex",/(^|_)(OPENAI|CODEX|CHATGPT)(_|$)/],
["Context7",/(^|_)CONTEXT7(_|$)/],["Statsig",/(^|_)STATSIG(_|$)/],
["Notion",/(^|_)NOTION(_|$)/],["ClickUp",/(^|_)CLICKUP(_|$)/],
["Linear",/(^|_)LINEAR(_|$)/],["Gmail / Google",/(^|_)(GMAIL|GOOGLE)(_|$)/],
["Outlook / Microsoft",/(^|_)(OUTLOOK|MICROSOFT|MSGRAPH|AZURE_AD)(_|$)/],
["Shopify",/(^|_)SHOPIFY(_|$)/],["Figma",/(^|_)FIGMA(_|$)/],
["Canva",/(^|_)CANVA(_|$)/],["n8n",/(^|_)N8N(_|$)/],
["Cloudflare",/(^|_)(CLOUDFLARE|CF_API)(_|$)/],
["Infisical",/(^|_)INFISICAL(_|$)/],
["DigitalOcean",/(^|_)(DIGITALOCEAN|DO_TOKEN|DO_API)(_|$)/],
["Slack",/(^|_)SLACK(_|$)/],["Manus",/(^|_)MANUS(_|$)/],
["DataCamp",/(^|_)DATACAMP(_|$)/],["AppDeploy",/(^|_)APPDEPLOY(_|$)/],
["Meta",/(^|_)(META|FACEBOOK|INSTAGRAM)(_|$)/],
["LINE",/(^|_)LINE(_|$)/],["Grab",/(^|_)(GRAB|GRABFOOD)(_|$)/],
["Shopee",/(^|_)(SHOPEE|SHOPEEFOOD)(_|$)/],["TikTok",/(^|_)TIKTOK(_|$)/]
];
const report={
 schema:"ogenic.infisical.plugin-service-metadata.v1",
 scope:"Runner-01 / authorized OGENIC org / accessible projects and environments",
 source:"Infisical OIDC + v4 secrets metadata viewSecretValue=false",
 rawSecretValuesCollected:false,accountPluginInstallStateProven:false,
 metadataOnly:true,run:"https://github.com/"+env.GITHUB_REPOSITORY+"/actions/runs/"+env.GITHUB_RUN_ID,
 projectCount:0,scannedEnvironmentCount:0,totalMetadataKeys:0,
 services:[],unclassifiedMetadataKeyCount:0,errors:[],identityMarkers:{GS:0,GT:0}
};
async function getJson(url,init={},stage="API"){
 const res=await fetch(url,{...init,signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw new Error(stage+":HTTP_"+res.status);
 return await res.json();
}
try {
 const oidc=await getJson(env.ACTIONS_ID_TOKEN_REQUEST_URL,{headers:{Authorization:"Bearer "+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}},"OIDC");
 if(typeof oidc.value!=="string"||!oidc.value)throw new Error("OIDC:NO_JWT");
 const login=await getJson("https://app.infisical.com/api/v1/auth/oidc-auth/login",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({identityId:env.INFISICAL_IDENTITY_ID,jwt:oidc.value,organizationSlug:env.INFISICAL_ORG_SLUG})
 },"AUTH");
 if(!login.accessToken)throw new Error("AUTH:NO_ACCESS_TOKEN");
 const headers={Authorization:"Bearer "+login.accessToken};
 const projectsResp=await getJson("https://app.infisical.com/api/v1/projects",{headers},"PROJECTS");
 const projects=(projectsResp.projects||[]).filter(p=>p.orgId===env.INFISICAL_ORG_ID);
 report.projectCount=projects.length;
 for(const p of projects) {
  const projectLabel=p.slug||p.name||"unknown-project";
  const environments=Array.isArray(p.environments)?p.environments:[];
  for(const rawEnv of environments){
   const environment=typeof rawEnv==="string"?rawEnv:rawEnv.slug;
   if(!environment)continue;
   const params=new URLSearchParams({
    projectId:p.id,environment,secretPath:"/",recursive:"true",
    viewSecretValue:"false",expandSecretReferences:"false"
   });
   try {
    const meta=await getJson("https://app.infisical.com/api/v4/secrets?"+params,{headers},"METADATA");
    if(!Array.isArray(meta.secrets))throw new Error("METADATA:INVALID_RESPONSE");
    report.scannedEnvironmentCount++;
    const seen=new Set();
    for(const secret of meta.secrets) {
      if(typeof secret.secretKey!=="string")continue;
      const key=secret.secretKey.toUpperCase().replace(/[^A-Z0-9]+/g,"_");
      const path=typeof secret.secretPath==="string"?secret.secretPath:"/";
      const distinct=path+"::"+key;
      if(seen.has(distinct))continue;
      seen.add(distinct);
      report.totalMetadataKeys++;
      const atoms=key.split("_");
      if(atoms.includes("GS"))report.identityMarkers.GS++;
      if(atoms.includes("GT"))report.identityMarkers.GT++;
      const matched=categories.filter(([,pattern])=>pattern.test(key)).map(([name])=>name);
      if(!matched.length){report.unclassifiedMetadataKeyCount++;continue;}
      for(const name of matched) {
       let item=report.services.find(s=>s.name===name);
       if(!item){item={name,metadataKeyCount:0,environments:[]};report.services.push(item);}
       item.metadataKeyCount++;
       const loc=projectLabel+":"+environment;
       if(!item.environments.includes(loc))item.environments.push(loc);
      }
    }
   }catch(err){report.errors.push({project:projectLabel,environment,reason:String(err.message).slice(0,70)});}
  }
 }
 report.services.sort((a,b)=>a.name.localeCompare(b.name));
 report.status=report.scannedEnvironmentCount?
  (report.errors.length?"PARTIAL_METADATA_READ":"METADATA_READ_SUCCESS"):"NO_ACCESSIBLE_METADATA";
}catch(err){
 report.status="AUTH_OR_ORG_ACCESS_BLOCKED";
 report.errors.push({reason:String(err.message).slice(0,80)});
}
writeFileSync("oge-infisical-plugin-metadata-audit.json",JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log("INFISICAL_METADATA_STATUS="+report.status);
console.log("PROJECT_COUNT="+report.projectCount);
console.log("SCANNED_ENVIRONMENTS="+report.scannedEnvironmentCount);
console.log("TOTAL_SECRET_KEY_METADATA="+report.totalMetadataKeys);
console.log("MATCHED_SERVICES="+report.services.map(x=>x.name).join(","));
console.log("UNKNOWN_SERVICE_KEY_COUNT="+report.unclassifiedMetadataKeyCount);
console.log("GS_GT_MARKERS_NOT_ACCOUNT_AUTH_PROOF=YES");
console.log("NO_SECRET_VALUES_LOGGED_OR_EXPORTED=YES");
console.log("ERRORS="+report.errors.map(x=>x.reason).join(","));
if(report.status!=="METADATA_READ_SUCCESS"&&report.status!=="PARTIAL_METADATA_READ")process.exitCode=88;
