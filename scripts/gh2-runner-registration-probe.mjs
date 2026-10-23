// Read-only GH2 runner registration probe using the current workflow's GitHub token.
// No runner change, credential output, provider installation, or new host.
const repo=process.env.GITHUB_REPOSITORY||"";
const token=process.env.GITHUB_TOKEN||"";
if(repo!=="Wave-Runner-2/Build-Platform"||!token){
  console.log("GH2_RUNNER_INVENTORY=CONFIGURATION_REQUIRED");
  process.exit(0);
}
try {
  const response=await fetch("https://api.github.com/repos/"+repo+"/actions/runners?per_page=100",{
    headers:{
      "Authorization":"Bearer "+token,
      "Accept":"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"ogenic-gh2-runner-readonly-inventory"
    }
  });
  if(response.status===401||response.status===403){
    console.log("GH2_RUNNER_INVENTORY=ACCESS_NOT_GRANTED_HTTP_"+response.status);
    console.log("GH2_RUNNER_BINDING=UNKNOWN (insufficient registration API permission; NOT runner offline)");
    process.exit(0);
  }
  if(!response.ok){
    console.log("GH2_RUNNER_INVENTORY=HTTP_"+response.status);
    process.exit(0);
  }
  const data=await response.json();
  const list=Array.isArray(data.runners)?data.runners:[];
  const exact=list.filter(x=>x.name==="wave-runner-01");
  const labelReady=exact.filter(x=>["self-hosted","linux","x64","wave"].every(label=>
    (x.labels||[]).some(v=>String(v.name).toLowerCase()===label)));
  const online=labelReady.filter(x=>x.status==="online");
  const ready=online.filter(x=>x.busy===false);
  console.log("GH2_RUNNER_INVENTORY=READ_OK");
  console.log("GH2_REGISTERED_RUNNERS="+list.length);
  console.log("EXISTING_WAVE_RUNNER_PRESENT="+(exact.length>0));
  console.log("MATCHED_LABELS="+labelReady.length);
  console.log("EXISTING_WAVE_RUNNER_ONLINE="+online.length);
  console.log("EXISTING_WAVE_RUNNER_IDLE="+ready.length);
  console.log("GH2_RUNNER_BINDING="+(ready.length?"READY":online.length?"ONLINE_BUSY":exact.length?"REGISTERED_NOT_READY":"NO_REPOSITORY_VISIBLE_BINDING"));
}catch(e){
  console.log("GH2_RUNNER_INVENTORY=NETWORK_ERROR");
  console.log("GH2_RUNNER_BINDING=UNKNOWN");
}
