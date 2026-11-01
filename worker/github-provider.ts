import provider from "../config/github-provider.json" with { type: "json" };

export const GITHUB_PROVIDER_LABEL = provider.display_label;
export const GITHUB_PROVIDER_LOGIN = provider.github_login;
export const GITHUB_PROVIDER_REPOSITORY = provider.repository;

// Active operational receipts must match the canonical repository exactly.
// Archived receipts remain in historical checkpoint storage, not dispatch authority.
export function isGitHubRunEvidence(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const prefix = `https://github.com/${GITHUB_PROVIDER_REPOSITORY}/actions/runs/`;
  return value.startsWith(prefix) && /^[1-9][0-9]*$/.test(value.slice(prefix.length));
}
