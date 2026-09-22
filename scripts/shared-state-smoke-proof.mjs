const buildUuid = String(process.env.WORKERS_CI_BUILD_UUID || "").trim();
const base = "https://ogenic-phase-vi-staging.tawatchaisamornrum11.workers.dev";
if (!buildUuid) {
  console.error("Shared-state smoke: WORKERS_CI_BUILD_UUID missing");
  process.exit(1);
}

let lastError = "";
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const response = await fetch(base + "/api/runtime-proof/shared-state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ogenic-build-proof": buildUuid,
      },
      body: "{}",
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body?.ok && body?.proof === "SHARED_STATE_V1_RUNTIME_VERIFIED") {
      console.log("SHARED_STATE_RUNTIME_PROOF_OK " + JSON.stringify({
        task_id: body.task_id,
        correlation_id: body.correlation_id,
        final_status: body.final_status,
        event_types: body.event_types,
        checkpoint_visible: body.checkpoint_visible,
        lock_released: body.lock_released,
        build_uuid: body.build_uuid,
      }));
      process.exit(0);
    }
    lastError = "HTTP_" + response.status + " " + JSON.stringify(body);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
console.error("SHARED_STATE_RUNTIME_PROOF_FAILED " + lastError);
process.exit(1);
