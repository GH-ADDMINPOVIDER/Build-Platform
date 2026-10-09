import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/parallel-agent-runtime.yml", import.meta.url), "utf8");

test("OGE-47 runtime workflow is canonical-branch-only and three-way parallel", () => {
  assert.match(workflow, /^\s{2}workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s{2}push:/m);
  assert.equal((workflow.match(/if: github.ref_name == 'phase-vi-provider-incentive-metering'/g) || []).length, 2);
  assert.match(workflow, /always\(\) && github.ref_name == 'phase-vi-provider-incentive-metering'/);
  assert.doesNotMatch(workflow, /branches:\s*\[[^\]]*(?:main|develop)/i);
  assert.match(workflow, /fail-fast:\s*false/);
  assert.match(workflow, /max-parallel:\s*3/);
  assert.match(workflow, /worker:\s*\[linearcodex, codex, claude\]/);
});

test("matrix workers cannot receive write credentials or bypass Yellow", () => {
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /git\s+push/i);
  assert.doesNotMatch(workflow, /wrangler\s+deploy/i);
  assert.doesNotMatch(workflow, /d1\s+migrations?\s+apply/i);
});

test("runtime workflow uses serial reducer and isolated Docker substrate", () => {
  assert.match(workflow, /serial-reducer:/);
  assert.match(workflow, /needs:\s*runtime-clones/);
  assert.match(workflow, /reduce-parallel-agent-results\.mjs/);
  assert.match(workflow, /--network=none/);
  assert.match(workflow, /--read-only/);
  assert.match(workflow, /--cap-drop=ALL/);
  assert.match(workflow, /no-new-privileges/);
});

test("one-pass Perplexity gate never performs a paid readiness proof", () => {
  assert.match(workflow, /OGENIC_RESEARCH_PROVIDER:\s*"perplexity"/);
  assert.match(workflow, /one-pass-runtime-refinery\.mjs/);
  assert.doesNotMatch(workflow, /api\.perplexity\.ai/i);
  assert.doesNotMatch(workflow, /sonar(?:-|_)?(?:pro|reasoning)/i);
});
