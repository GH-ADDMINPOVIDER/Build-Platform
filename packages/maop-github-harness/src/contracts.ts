export type GithubReadCapability =
  | "github.repo.read"
  | "github.file.read"
  | "github.code.search"
  | "github.issue.read"
  | "github.pr.read"
  | "github.actions.status";

export type VerificationState = "verified" | "partially_verified" | "unverified" | "blocked" | "failed";

export type ToolRuntime = {
  signal?: AbortSignal;
  agentId?: string;
};

export type HarnessTool = {
  name: GithubReadCapability;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: unknown, runtime?: ToolRuntime): Promise<MaopGithubResult>;
};

export type HarnessContext = {
  tools: {
    register(tool: HarnessTool): void | (() => void);
  };
  effect?(setup: () => void | (() => void)): void;
};

export type MaopYellowRequest = {
  actor_id: string;
  capability: GithubReadCapability;
  provider: "github";
  environment: "staging";
  permission_class: "READ";
  input: Record<string, unknown>;
  signal?: AbortSignal;
};

export type YellowResponse = {
  ok?: boolean;
  code?: string;
  run_id?: string;
  output?: unknown;
  result?: unknown;
  resolver?: unknown;
  verification?: {
    status?: VerificationState;
    [key: string]: unknown;
  };
  evidence?: unknown;
  [key: string]: unknown;
};

export type RubyVerification = {
  verified: boolean;
  evidence_ref?: string;
  detail?: string;
};

export type BridgeBindings = {
  executeYellow(request: MaopYellowRequest): Promise<YellowResponse>;
  verifyRuby?(input: {
    actor_id: string;
    capability: GithubReadCapability;
    yellow: YellowResponse;
  }): Promise<RubyVerification>;
  defaultActorId?: string;
};

export type MaopGithubResult = {
  ok: boolean;
  provider: "github";
  capability: GithubReadCapability;
  actor_id: string;
  permission_class: "READ";
  verification_state: VerificationState;
  ruby_verified: boolean;
  evidence_refs: string[];
  retention_eligible: boolean;
  output?: unknown;
  safe_error?: {
    code: string;
    message?: string;
  };
};
