import test from "node:test";
import assert from "node:assert/strict";
import { isGitHubRunEvidence, GITHUB_PROVIDER_LABEL, GITHUB_PROVIDER_LOGIN, GITHUB_PROVIDER_REPOSITORY } from "../worker/github-provider.ts";

test("live operational receipts require the renamed GH-ADDMINPOVIDER canonical repository", () => {
  assert.equal(GITHUB_PROVIDER_LABEL, "GH-ADDMINPOVIDER");
  assert.equal(GITHUB_PROVIDER_LOGIN, "GH-ADDMINPOVIDER");
  assert.equal(GITHUB_PROVIDER_REPOSITORY, "GH-ADDMINPOVIDER/Build-Platform");
  assert.equal(isGitHubRunEvidence("https://github.com/GH-ADDMINPOVIDER/Build-Platform/actions/runs/41301903924"), true);
});

test("archived account references remain historical only, never accepted as current provider receipts", () => {
  assert.equal(isGitHubRunEvidence("https://github.com/Wave-Runner-2/Build-Platform/actions/runs/40746602109"), false);
  assert.equal(isGitHubRunEvidence("https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39702219051"), false);
});

test("another repository, credentials, suffixes and malformed IDs cannot become operational receipts", () => {
  for (const value of [undefined, {}, "GH-ADDMINPOVIDER",
    "https://github.com/GH-ADDMINPOVIDER/Other/actions/runs/1",
    "https://github.com.evil.invalid/GH-ADDMINPOVIDER/Build-Platform/actions/runs/1",
    "https://owner@github.com/GH-ADDMINPOVIDER/Build-Platform/actions/runs/1",
    "https://github.com/GH-ADDMINPOVIDER/Build-Platform/actions/runs/0",
    "https://github.com/GH-ADDMINPOVIDER/Build-Platform/actions/runs/1?anything=1",
    "https://github.com/GH-ADDMINPOVIDER/Build-Platform/actions/runs/1/attempts/2",
    "http://github.com/GH-ADDMINPOVIDER/Build-Platform/actions/runs/1"]) {
    assert.equal(isGitHubRunEvidence(value), false, String(value));
  }
});
