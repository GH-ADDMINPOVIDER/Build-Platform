// GH2 staging OIDC metadata only — never print credential values or make external provider calls.
const expected={
 slack:["SLACK_BOT_TOKEN","SLACK_WEBHOOK_URL","SLACK_CHANNEL_ID","SLACK_APP_TOKEN"],
 atlassian_statuspage:["STATUSPAGE_API_KEY","ATLASSIAN_STATUSPAGE_API_KEY","STATUSPAGE_PAGE_ID","ATLASSIAN_STATUSPAGE_PAGE_ID"],
 discord:["DISCORD_TOKEN","DISCORD_BOT_TOKEN","DISCORD_GUILD_ID"],
 openai_agent:["OPENAI_API_KEY","OPENAI_AGENT_MODEL"],
 github_runner:["GH-ID-TOMLOAD-RUNNER-2","SSH_PRIVATE_KEY","SSH_FINGER_PRINT_KEY"]
};
const result={schema:"wave.ops.alert_destinations.inventory.v1",environment:"staging",identity:"GH2 Infisical OIDC recursive",observed_at:new Date().toISOString(),providers:{},secret_values_printed:false,connected_end_to_end:false};
for(const [group,names] of Object.entries(expected)){
 const fields=names.map(name=>({name,present:!!(process.env[name]||"").trim()}));
 result.providers[group]={fields,credential_named_count:fields.filter(x=>x.present).length,external_api_tested:false};
}
console.log("WAVE_OPS_ALERT_SINKS_INVENTORY="+JSON.stringify(result));
