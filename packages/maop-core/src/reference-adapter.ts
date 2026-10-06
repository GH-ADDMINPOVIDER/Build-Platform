import type {
  AdapterContext,
  AdapterReadiness,
  AdapterResult,
  InterfaceFamily,
  MaopAdapter,
  MaopCapability,
} from "./contracts.js";

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|cookie|private[_-]?key)/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._~+/=-]{12,})/i;

function sanitized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitized);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && SECRET_VALUE.test(value)) return "[REDACTED_SECRET_LIKE]";
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? "[REDACTED]" : sanitized(current);
  }
  return out;
}

export class ReferenceReadAdapter implements MaopAdapter<Record<string, unknown>, unknown> {
  readonly id: string;
  readonly version = "0.1.0";
  readonly interface_family: InterfaceFamily;

  constructor(interfaceFamily: InterfaceFamily, id = `reference-${interfaceFamily}`) {
    this.interface_family = interfaceFamily;
    this.id = id;
  }

  async discover(): Promise<MaopCapability[]> {
    return [];
  }

  async readiness(_context: AdapterContext): Promise<AdapterReadiness> {
    return {
      state: "VERIFIED",
      checked_at: "2026-10-06T00:00:00.000Z",
      evidence_ref: `local:${this.id}:readiness`,
    };
  }

  async execute(input: Record<string, unknown>, context: AdapterContext): Promise<AdapterResult> {
    if (context.capability.permission_class !== "READ") {
      return {
        ok: false,
        safe_error: { code: "REFERENCE_ADAPTER_READ_ONLY" },
        evidence_refs: [],
      };
    }
    if (context.signal?.aborted) {
      return {
        ok: false,
        safe_error: { code: "CANCELED" },
        evidence_refs: [],
      };
    }
    return {
      ok: true,
      output: {
        interface_family: this.interface_family,
        local_fixture: true,
        input: sanitized(input),
      },
      evidence_refs: [`local:${this.id}:execute`],
    };
  }
}
