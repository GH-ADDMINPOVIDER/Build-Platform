type DispatchEnv = {
  GITHUB_TOKEN?: string;
};

const compact = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export async function dispatchWaveCommandConsumer(env: DispatchEnv, taskId: string) {
  const token = compact(env.GITHUB_TOKEN, 4000);
  if (!token) return { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "GITHUB_TOKEN" };
  const response = await fetch(
    "https://api.github.com/repos/Wave-Runner-2/Build-Platform/actions/workflows/wave-command-consumer.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "ogenic-wave-command",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: "phase-vi-provider-incentive-metering",
        inputs: { task_id: taskId },
      }),
    },
  );
  // GitHub workflow_dispatch only acknowledges acceptance with HTTP 204.
  // Do not treat a different 2xx response as proof of an Actions dispatch.
  if (response.status !== 204) return { ok: false as const, code: `GITHUB_DISPATCH_HTTP_${response.status}` };
  return { ok: true as const };
}
