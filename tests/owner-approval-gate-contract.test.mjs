import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("all repository paths are owned by the canonical GitHub owner", () => {
  const codeowners = read(".github/CODEOWNERS");
  assert.match(codeowners, /^\* @Wave-Runner-2$/m);
});

test("owner approval gate is read-only and binds approval to the current PR head", () => {
  const workflow = read(".github/workflows/owner-approval-gate.yml");
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /pull_request_review:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /OWNER_LOGIN: Wave-Runner-2/);
  assert.match(workflow, /pulls\.listReviews/);
  assert.match(workflow, /owner\.state !== "APPROVED"/);
  assert.match(workflow, /owner\.commit_id !== pull\.head\.sha/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  assert.doesNotMatch(workflow, /pull-requests:\s*write/);
});

test("policy documents the required GitHub enforcement settings and limitation", () => {
  const policy = read("docs/OWNER_CODE_CHANGE_GUARD.md");
  assert.match(policy, /Require review from Code Owners/);
  assert.match(policy, /Owner approval gate \/ owner-approval/);
  assert.match(policy, /Restrict direct pushes/);
  assert.match(policy, /available\s+GitHub token is invalid/);
});
