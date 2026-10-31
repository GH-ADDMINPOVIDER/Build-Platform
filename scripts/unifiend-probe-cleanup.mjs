// Cancel only untouched checks created by this naming migration. Preserve
// the original Owner task, manual invocations, cloud tests and running work.
const MIGRATION_SOURCE = "3907c6dce1e34c74f318b8c2a083fdfe1962bb5b";
export async function cancelUnstartedMigrationChecks({ request = fetch, headers, sourceSha, currentRunId }) {
  const report = { cancelled: [], preserved_started: [], failures: [] };
  const base = "https://api.github.com/repos/Wave-Runner-2/Build-Platform";
  const read = async path => {
    const response = await request(base + path, { headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("READ_REJECTED");
    return response.json();
  };
  if (!/^[a-f0-9]{40}$/.test(sourceSha || "") || !/^\d+$/.test(String(currentRunId || ""))) return { ...report, state: "SCOPE_REJECTED" };
  for (const sha of [MIGRATION_SOURCE]) {
    let inventory;
    try { inventory = await read(`/actions/runs?head_sha=${sha}&per_page=100`); }
    catch { report.failures.push({ stage: "inventory" }); continue; }
    if (!Array.isArray(inventory.workflow_runs) || inventory.total_count > inventory.workflow_runs.length) {
      report.failures.push({ stage: "incomplete_inventory" }); continue;
    }
    for (const run of inventory.workflow_runs) {
      if (run.head_sha !== sha || run.head_branch !== "Unified-on-Progress" || run.event !== "push"
        || String(run.id) === String(currentRunId) || !Number.isSafeInteger(run.id)
        || !["queued", "pending", "waiting"].includes(run.status)
        || [".github/workflows/unifiend-capability-access.yml", ".github/workflows/audit-build.yml"].includes(run.path)) continue;
      try {
        const jobs = await read(`/actions/runs/${run.id}/jobs?per_page=100`);
        if (!Array.isArray(jobs.jobs) || jobs.total_count > jobs.jobs.length
          || jobs.jobs.some(job => job.status !== "queued" || job.steps?.some(step => step.started_at))) {
          report.preserved_started.push(run.id); continue;
        }
        const response = await request(`${base}/actions/runs/${run.id}/cancel`, { method: "POST", headers,
          redirect: "manual", signal: AbortSignal.timeout(15000) });
        if (response.status === 202) report.cancelled.push(run.id);
        else report.failures.push({ run_id: run.id, http_status: response.status });
      } catch { report.failures.push({ run_id: run.id }); }
    }
  }
  return report;
}
