// Read-only metadata: reveal credential NAME presence, NEVER values, hashes or access tokens.
const expected=['OCIAN_SSH_KNOWN_HOSTS','SSH_KNOWN_HOSTS','OGENIC_SSH_KNOWN_HOSTS','OCIAN_SSH_HOST_FINGERPRINT','SSH_HOST_FINGERPRINT','OCIAN_SSH_FINGERPRINT_SHA256','OCIAN_SSH_HOST_PUBLIC_KEY','SSH_HOST_ED25519_PUBLIC_KEY','OCIAN_SSH_PRIVATE_KEY','TMN_SSH_PRIVATE_KEY','SSH_PRIVATE_KEY','GH-ID-TOMLOAD-RUNNER-2'];
const names=Object.keys(process.env).filter(name=>/OCIAN|_SSH|SSH_|HOST_KEY|HOSTKEY|FINGERPRINT|KNOWN_HOST|ED25519|RUNNER_2|TOMLOAD|GH.?ID/i.test(name) && !/TOKEN$|SECRET$|COOKIE$|KEY$|AUTH$/i.test(name));
const reported=expected.map(name=>({name,bound:typeof process.env[name]==='string'&&process.env[name].length>10}));
const extraNames=Object.keys(process.env).filter(name=>/OCIAN|_SSH|SSH_|HOST_KEY|HOSTKEY|FINGERPRINT|KNOWN_HOST|ED25519|TMN|TOMLOAD|GH.?ID/i.test(name)&&!expected.includes(name));
const summary={schema:'wave.infisical.path_discovery.v1',project_slug:process.env.INFISICAL_PROJECT_SLUG,scope:'recursive_staging_oidc',known_names:reported,additional_candidate_names:extraNames.map(name=>name.replace(/[^A-Za-z0-9_-]/g,'_')).slice(0,50),candidate_count:extraNames.length,secret_values_logged:false,ocian_host_called:false,restore_not_attempted:true};
console.log('INFISICAL_RECURSIVE_SSH_METADATA='+JSON.stringify(summary));
