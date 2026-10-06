import type { GithubReadCapability } from "./contracts.js";

export type CapabilitySpec = {
  capability: GithubReadCapability;
  description: string;
  required: string[];
  allowed: string[];
  inputSchema: Record<string, unknown>;
};

const stringProperty = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });

export const CAPABILITY_SPECS: Record<GithubReadCapability, CapabilitySpec> = {
  "github.repo.read": {
    capability: "github.repo.read",
    description: "Read safe repository metadata through MA-OP/Yellow.",
    required: [],
    allowed: ["repository"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { repository: stringProperty(180) },
    },
  },
  "github.file.read": {
    capability: "github.file.read",
    description: "Read one safe repository file through MA-OP/Yellow.",
    required: ["path"],
    allowed: ["path", "repository"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: stringProperty(500),
        repository: stringProperty(180),
      },
    },
  },
  "github.code.search": {
    capability: "github.code.search",
    description: "Search repository code through MA-OP/Yellow.",
    required: ["query"],
    allowed: ["query", "repository"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: stringProperty(500),
        repository: stringProperty(180),
      },
    },
  },
  "github.issue.read": {
    capability: "github.issue.read",
    description: "Read a GitHub issue through MA-OP/Yellow.",
    required: ["number"],
    allowed: ["number", "repository"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["number"],
      properties: {
        number: { type: "integer", minimum: 1 },
        repository: stringProperty(180),
      },
    },
  },
  "github.pr.read": {
    capability: "github.pr.read",
    description: "Read a GitHub pull request through MA-OP/Yellow.",
    required: ["number"],
    allowed: ["number", "repository"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["number"],
      properties: {
        number: { type: "integer", minimum: 1 },
        repository: stringProperty(180),
      },
    },
  },
  "github.actions.status": {
    capability: "github.actions.status",
    description: "Read GitHub Actions status through MA-OP/Yellow.",
    required: [],
    allowed: ["repository", "ref", "workflow"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        repository: stringProperty(180),
        ref: stringProperty(180),
        workflow: stringProperty(240),
      },
    },
  },
};

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|cookie|private[_-]?key)/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._~+/=-]{12,})/i;

export function validateInput(capability: GithubReadCapability, value: unknown): Record<string, unknown> {
  const spec = CAPABILITY_SPECS[capability];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT_OBJECT");
  const input = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  const properties = (spec.inputSchema.properties ?? {}) as Record<string, { maxLength?: number }>;
  for (const key of Object.keys(input)) {
    if (!spec.allowed.includes(key)) throw new Error(`UNSUPPORTED_INPUT_FIELD:${key}`);
    if (SECRET_KEY.test(key)) throw new Error(`CREDENTIAL_FIELD_REJECTED:${key}`);
  }
  for (const key of spec.required) {
    const current = input[key];
    if (current === undefined || current === null || current === "") throw new Error(`REQUIRED_INPUT_MISSING:${key}`);
  }
  for (const [key, current] of Object.entries(input)) {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed) throw new Error(`EMPTY_INPUT_FIELD:${key}`);
      if (SECRET_VALUE.test(trimmed)) throw new Error(`CREDENTIAL_VALUE_REJECTED:${key}`);
      const maxLength = properties[key]?.maxLength;
      if (typeof maxLength === "number" && trimmed.length > maxLength) throw new Error(`INPUT_TOO_LONG:${key}`);
      normalized[key] = trimmed;
      continue;
    }
    if (key === "number" && (!Number.isInteger(current) || Number(current) < 1)) {
      throw new Error("INVALID_NUMBER");
    }
    normalized[key] = current;
  }
  return normalized;
}

export function safeObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeObject);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && SECRET_VALUE.test(value)) return "[REDACTED_SECRET_LIKE]";
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = safeObject(current);
  }
  return out;
}
