import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const provider = JSON.parse(readFileSync(new URL("../config/github-provider.json", import.meta.url), "utf8"));
const oidc = JSON.parse(readFileSync(new URL("../config/github-oidc.staging.json", import.meta.url), "utf8"));

test("OIDC trust proposal matches the current immutable GH-ADDMINPOVIDER repository identity", () => {
  assert.equal(provider.github_login, "GH-ADDMINPOVIDER");
  assert.equal(provider.repository, "GH-ADDMINPOVIDER/Build-Platform");
  assert.equal(provider.github_user_id, 342175560);
  assert.equal(provider.repository_id, 1429580446);
  const [owner, name] = provider.repository.split("/");
  assert.equal(owner, provider.github_login);
  assert.equal(oidc.issuer, "https://token.actions.githubusercontent.com");
  assert.equal(oidc.audience, `https://github.com/${owner}`);
  assert.equal(
    oidc.subject,
    `repo:${owner}@${provider.github_user_id}/${name}@${provider.repository_id}:ref:refs/heads/${provider.staging_branch}`
  );
  assert.equal(oidc.branch, provider.staging_branch);
  assert.equal(oidc.environment, "staging");
  assert.equal(/Wave-Runner-2|Ogenicchocolate21debug|1350684572/.test(oidc.subject + oidc.audience), false);
});

test("OIDC source contract is not a false claim of Infisical acceptance or self-host E2E", () => {
  assert.equal(provider.runner_registration_state, "PENDING_LIVE_HOST_CUTOVER");
});
