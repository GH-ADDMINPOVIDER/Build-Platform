type DispatchEnv = {
  GITHUB_TOKEN?: string;
  GH_ADDMINPROVIDER_REPOSITORY?: string;
  GH_ADDMINPROVIDER_STAGING_REF?: string;
  GH_ADDMINPROVIDER_WORKFLOW?: string;
};

const compact = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const repositoryPath = (repository: string) => repository.split("/").map(encodeURIComponent).join("/");

export async function dispatchWaveCommandConsumer(env: DispatchEnv, taskId: string) {
  const token = compact(env.GITHUB_TOKEN, 4000);
  const repository = compact(env.GH_ADDMINPROVIDER_REPOSITORY, 240);
  const ref = compact(env.GH_ADDMINPROVIDER_STAGING_REF, 240);
  const workflow = compact(env.GH_ADDMINPROVIDER_WORKFLOW, 240);
  if (!token) return { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "GITHUB_TOKEN" };
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !ref || !workflow) {
    return { ok: false as const, code: "GH_ADDMINPROVIDER_CONFIGURATION_REQUIRED" };
  }
  const response = await fetch(
    `https://api.github.com/repos/${repositoryPath(repository)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "ogenic-gh-addminprovider-command",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref, inputs: { task_id: taskId } }),
    },
  );
  if (response.status !== 204) return { ok: false as const, code: `GITHUB_DISPATCH_HTTP_${response.status}` };
  return { ok: true as const };
}
