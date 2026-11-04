// Pure output guard used by the existing Unifiend Codex consumer.
// Codex CLI diagnostics sometimes contain "Bearer authentication" as prose.
// The previous blanket 12-letter regex misclassified those words as credentials.
// Keep fail-closed detection for credential-shaped Bearer values:
// long URL-safe opaque strings containing a digit or token punctuation.
// Neither the CLI output nor a candidate value is logged or sent to D1.
export const bearerCredentialPattern =
  /(?:^|[^a-z0-9_])bearer[ \t]+(?=[a-z0-9._~+/=-]{20,}(?![a-z0-9._~+/=-]))(?=[a-z0-9._~+/=-]*[0-9._~+/=-])[a-z0-9._~+/=-]{20,}/i;
