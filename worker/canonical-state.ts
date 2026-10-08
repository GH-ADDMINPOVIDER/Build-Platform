export type VerificationState = "PASS" | "FAIL" | "BLOCKED" | "NOT_MEASURED";
export type ProvenanceKind = "generated" | "research" | "provider" | "repository" | "runtime";

export type PromotionArtifact = {
  artifactId: string;
  contentHash: string;
  summary: string;
  provenance: {
    kind: ProvenanceKind;
    sourceRef: string;
    providerSessionRef?: string | null;
  };
  verification: {
    state: VerificationState;
    verifier: string;
    evidenceRefs: string[];
  };
  terminalTrustOwner: string | null;
};

export function evaluateGreenPromotion(artifact: PromotionArtifact) {
  if (!artifact.artifactId || !artifact.contentHash) return { ok: false as const, code: "ARTIFACT_IDENTITY_REQUIRED" };
  if (!artifact.provenance.sourceRef) return { ok: false as const, code: "PROVENANCE_REQUIRED" };
  if (artifact.verification.state !== "PASS") return { ok: false as const, code: "RUBY_PASS_REQUIRED" };
  if (artifact.verification.verifier !== "RUBY") return { ok: false as const, code: "RUBY_VERIFIER_REQUIRED" };
  if (!artifact.verification.evidenceRefs.length) return { ok: false as const, code: "EVIDENCE_REQUIRED" };
  if (!artifact.terminalTrustOwner) return { ok: false as const, code: "TERMINAL_TRUST_OWNER_REQUIRED" };
  return {
    ok: true as const,
    code: "GREEN_PROMOTION_ALLOWED",
    retained: {
      artifactId: artifact.artifactId,
      contentHash: artifact.contentHash,
      summary: artifact.summary.slice(0, 2400),
      provenance: artifact.provenance,
      evidenceRefs: [...artifact.verification.evidenceRefs],
      verifier: "RUBY",
      terminalTrustOwner: artifact.terminalTrustOwner,
    },
  };
}

export function compactHandoff(artifact: PromotionArtifact) {
  return {
    artifactId: artifact.artifactId,
    contentHash: artifact.contentHash,
    provenance: artifact.provenance,
    verification: {
      state: artifact.verification.state,
      verifier: artifact.verification.verifier,
      evidenceRefs: [...artifact.verification.evidenceRefs],
    },
    summary: artifact.summary.slice(0, 2400),
  };
}

export function reconcileCanonical<T>(canonical: T | null, providerProjection: T | null) {
  if (canonical !== null) return { value: canonical, source: "GREEN_1LSS" as const, projectionUsed: false };
  return { value: providerProjection, source: "PROVIDER_PROJECTION" as const, projectionUsed: providerProjection !== null };
}

export function deletionReceipt(input: {
  canonicalConfirmed: boolean;
  projectionConfirmed: boolean;
  auditDispositionConfirmed: boolean;
  providerConfirmed: boolean;
}) {
  const complete =
    input.canonicalConfirmed &&
    input.projectionConfirmed &&
    input.auditDispositionConfirmed &&
    input.providerConfirmed;
  return {
    complete,
    canonical: input.canonicalConfirmed ? "CONFIRMED" : "UNCONFIRMED",
    projections: input.projectionConfirmed ? "CONFIRMED" : "UNCONFIRMED",
    audit: input.auditDispositionConfirmed ? "CONFIRMED" : "UNCONFIRMED",
    providerSide: input.providerConfirmed ? "CONFIRMED" : "UNCONFIRMED",
  };
}
