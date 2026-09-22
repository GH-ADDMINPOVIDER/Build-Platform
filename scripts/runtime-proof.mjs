const buildUuid = String(process.env.WORKERS_CI_BUILD_UUID || "").trim();
const base = "https://ogenic-phase-vi-staging.tawatchaisamornrum11.workers.dev";
if (!buildUuid) {
  console.error("1LSS runtime proof: WORKERS_CI_BUILD_UUID missing");
  process.exit(1);
}

let lastError = "";
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const response = await fetch(base + "/api/1lss/runtime-proof", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ogenic-build-proof": buildUuid,
      },
      body: "{}",
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body?.ok && body?.proof === "1LSS_EXTERNAL_AGENT_RUNTIME_VERIFIED") {
      console.log("1LSS_RUNTIME_PROOF_OK " + JSON.stringify({
        conversation_id: body.conversation_id,
        session_line: body.session_line,
        source_surface: body.source_surface,
        sequence_no: body.sequence_no,
        retry_sequence_no: body.retry_sequence_no,
        replayed_count: body.replayed_count,
        observed_via_event_feed: body.observed_via_event_feed,
        backlog: body.backlog,
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
console.error("1LSS_RUNTIME_PROOF_FAILED " + lastError);
process.exit(1);
