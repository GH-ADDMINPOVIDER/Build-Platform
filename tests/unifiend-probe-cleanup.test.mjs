import test from "node:test";
import assert from "node:assert/strict";
import { cancelUnstartedMigrationChecks } from "../scripts/unifiend-probe-cleanup.mjs";

test("migration cleanup excludes original tasks, manual invocations, cloud validation and started steps", async () => {
  const sha = "3907c6dce1e34c74f318b8c2a083fdfe1962bb5b";
  const cancelled = [];
  const request = async (url, init) => {
    if (url.includes("/actions/runs?")) {
      if (!url.includes(sha)) return Response.json({ total_count: 0, workflow_runs: [] });
      return Response.json({ total_count: 6, workflow_runs: [
        { id: 1, head_sha: sha, head_branch: "Unified-on-Progress", event: "push", status: "queued", path: ".github/workflows/host-check.yml" },
        { id: 2, head_sha: sha, head_branch: "Unified-on-Progress", event: "workflow_dispatch", status: "queued", path: ".github/workflows/host-check.yml" },
        { id: 3, head_sha: sha, head_branch: "Unified-on-Progress", event: "push", status: "queued", path: ".github/workflows/audit-build.yml" },
        { id: 4, head_sha: sha, head_branch: "Unified-on-Progress", event: "push", status: "queued", path: ".github/workflows/started-check.yml" },
        { id: 5, head_sha: "b".repeat(40), head_branch: "Unified-on-Progress", event: "push", status: "queued", path: ".github/workflows/original-check.yml" },
        { id: 6, head_sha: sha, head_branch: "main", event: "push", status: "queued", path: ".github/workflows/main-check.yml" },
      ] });
    }
    if (url.includes("/4/jobs")) return Response.json({ total_count: 1, jobs: [{ status: "queued", steps: [{ started_at: "2026-10-31T00:00:00Z" }] }] });
    if (url.endsWith("/jobs?per_page=100")) return Response.json({ total_count: 1, jobs: [{ status: "queued", steps: [] }] });
    if (url.endsWith("/cancel")) { assert.equal(init.method, "POST"); cancelled.push(url); return new Response(null, { status: 202 }); }
    throw new Error("unexpected request");
  };
  const report = await cancelUnstartedMigrationChecks({ request, headers: {}, sourceSha: sha, currentRunId: "99" });
  assert.deepEqual(report.cancelled, [1]);
  assert.deepEqual(report.preserved_started, [4]);
  assert.equal(cancelled.length, 1);
});

test("incomplete inventories fail closed before any cancellation", async () => {
  const report = await cancelUnstartedMigrationChecks({ request: async () => Response.json({ total_count: 101, workflow_runs: [] }),
    headers: {}, sourceSha: "a".repeat(40), currentRunId: "99" });
  assert.equal(report.cancelled.length, 0);
  assert.ok(report.failures.every(x => x.stage === "incomplete_inventory"));
});
