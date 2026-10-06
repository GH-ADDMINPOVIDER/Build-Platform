import type { BridgeBindings, HarnessContext, HarnessTool, ToolRuntime } from "./contracts.js";
import { MaopGithubBridge } from "./bridge.js";
import { CAPABILITY_SPECS } from "./tools.js";

export const name = "maop-github-harness";
export const inject = ["tools"] as const;

export function defineTool(tool: HarnessTool): HarnessTool {
  return Object.freeze(tool);
}

export function apply(ctx: HarnessContext, bindings: BridgeBindings) {
  if (!ctx?.tools || typeof ctx.tools.register !== "function") throw new Error("HARNESS_TOOLS_SERVICE_REQUIRED");
  const bridge = new MaopGithubBridge(bindings);
  const disposers: Array<() => void> = [];

  for (const spec of Object.values(CAPABILITY_SPECS)) {
    const tool = defineTool({
      name: spec.capability,
      description: spec.description,
      inputSchema: spec.inputSchema,
      execute: (input: unknown, runtime?: ToolRuntime) => bridge.execute(spec.capability, input, runtime),
    });
    const dispose = ctx.tools.register(tool);
    if (typeof dispose === "function") disposers.push(dispose);
  }

  const cleanup = () => {
    for (const dispose of disposers.splice(0)) dispose();
  };

  if (typeof ctx.effect === "function") {
    ctx.effect(() => cleanup);
    return;
  }
  return cleanup;
}
