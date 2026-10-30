import provider from "../config/github-provider.json" with { type: "json" };

export const GITHUB_PROVIDER_LABEL = provider.display_label;
export const GITHUB_PROVIDER_LOGIN = provider.github_login;
export const GITHUB_PROVIDER_REPOSITORY = provider.repository;

// An old proof URL remains historical evidence. It never becomes a dispatch target.
export function isGitHubRunEvidence(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return [provider.repository, provider.historical_evidence_repository].some(
    repository => value.startsWith(`https://github.com/${repository}/actions/runs/`)
      && /^[1-9][0-9]*$/.test(value.slice(`https://github.com/${repository}/actions/runs/`.length)),
  );
}
