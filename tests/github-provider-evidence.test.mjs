import test from "node:test";
import assert from "node:assert/strict";
import { isGitHubRunEvidence, GITHUB_PROVIDER_LABEL } from "../worker/github-provider.ts";

test("current GH-ADDMINPOVIDER receipts and preserved historical receipts are accepted", () => {
  assert.equal(GITHUB_PROVIDER_LABEL, "GH-ADDMINPOVIDER");
  assert.equal(isGitHubRunEvidence("https://github.com/Wave-Runner-2/Build-Platform/actions/runs/40746602109"), true);
  assert.equal(isGitHubRunEvidence("https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39702219051"), true);
});

test("a label, another repository, credentials, suffixes and malformed run IDs are not evidence", () => {
  for (const value of [undefined, {}, "GH-ADDMINPOVIDER", "https://github.com/Wave-Runner-2/Other/actions/runs/1",
    "https://github.com.evil.invalid/Wave-Runner-2/Build-Platform/actions/runs/1",
    "https://owner@github.com/Wave-Runner-2/Build-Platform/actions/runs/1",
    "https://github.com/Wave-Runner-2/Build-Platform/actions/runs/0",
    "https://github.com/Wave-Runner-2/Build-Platform/actions/runs/1?anything=1",
    "https://github.com/Wave-Runner-2/Build-Platform/actions/runs/1/attempts/2",
    "http://github.com/Wave-Runner-2/Build-Platform/actions/runs/1"]) {
    assert.equal(isGitHubRunEvidence(value), false, String(value));
  }
});
