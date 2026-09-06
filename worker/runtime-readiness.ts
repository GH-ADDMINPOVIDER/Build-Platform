// Workflow Engine v0.1 — pure, fail-closed runtime readiness evaluation.
// No I/O, provider probing, credential resolution, or dispatch occurs here.

const REQUIRED_CHECKS = [
  "adapter",
  "runtime",
  "scopedCredential",
] as const;

export type RuntimeReadinessCheck = (typeof REQUIRED_CHECKS)[number];

export type ReadinessObservation =
  | "verified"
  | "unavailable"
  | "unknown";

export type RuntimeReadinessEvidence = Readonly<
  Partial<Record<RuntimeReadinessCheck, ReadinessObservation>>
>;

export type RuntimeReadiness =
  | { readonly ready: true }
  | {
      readonly ready: false;
      readonly blockingChecks: readonly RuntimeReadinessCheck[];
    };

/**
 * Evaluates redacted observations from trusted server-side checks.
 *
 * `verified` means:
 * - adapter: an executable implementation exists and is not a placeholder.
 * - runtime: execution prerequisites have been checked for this invocation.
 * - scopedCredential: authorization for this invocation scope passed.
 *
 * A configured provider name or merely-present environment key is insufficient.
 * This result is not an authorization token; dispatch must still enforce scope.
 */
export function evaluateRuntimeReadiness(
  evidence: RuntimeReadinessEvidence = {},
): RuntimeReadiness {
  const blockingChecks = REQUIRED_CHECKS.filter(
    (check) => evidence[check] !== "verified",
  );

  return blockingChecks.length === 0
    ? { ready: true }
    : { ready: false, blockingChecks };
}
