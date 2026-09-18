import { ai, error, json, router } from '@appdeploy/sdk';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type AgentId = 'ogenic' | 'code' | 'github' | 'vercel' | 'linear';

const canonicalContext = `
You are OGENIC AI inside the owner's OGENIC Control App.
Canonical project context:
- Project: OGENIC Phase VI.
- Repository: Ogenicchocolate21debug/Build-Platform.
- Active branch: phase-vi-provider-incentive-metering.
- Goal: one mobile control app for Chat, Tools, Tasks, Connectors and System.
- The user is the owner/operator of OGENIC.
- Production changes, deletion, spending and important permission changes require explicit approval.
- This AppDeploy preview DOES NOT automatically inherit ChatGPT Memory or ChatGPT Plugins.
- GitHub, Linear, Google Drive, Notion and Vercel may be connected in the user's ChatGPT account, but this web app cannot claim it used them until an OGENIC Tool Gateway is actually connected.
- Cloudflare Worker/D1 is the intended canonical runtime/state layer for Phase VI, but this preview is currently hosted on AppDeploy.
Behavior:
- Reply in the user's language; Thai should be natural, direct and friendly.
- Preserve context from the provided conversation and the user's saved memory.
- Never invent tool execution, runtime status, model identity, deployment success or external actions.
- When asked what you know about the user, distinguish project context from private personal identity.
- Prefer Result / Blocked / Next for operational work.
`;

const agentInstructions: Record<AgentId, string> = {
  ogenic: 'Act as the main OGENIC supervisor. Coordinate architecture, priorities, blockers and next actions.',
  code: 'Act as the OGENIC code implementation specialist. Focus on implementation plans, debugging, tests, code review and safe changes. Do not claim you edited or ran code unless tool evidence is provided.',
  github: 'Act as the OGENIC GitHub specialist. Focus on branches, commits, pull requests, CI and repository hygiene. The GitHub tool gateway is not connected in this web app, so never claim live GitHub reads or writes; explain what can be inferred from canonical context and what needs gateway evidence.',
  vercel: 'Act as the OGENIC deployment specialist. Focus on Vercel previews, deployment blockers, release safety and verification. The Vercel tool gateway is not connected in this web app, so never claim live deployment actions or status without evidence.',
  linear: 'Act as the OGENIC Linear task-planning specialist. Focus on issues, projects, task breakdowns, priorities, dependencies and status planning. The Linear tool gateway is not connected in this web app, so never claim live Linear reads or writes; clearly separate planning from executed changes.',
};

export const handler = router({
  'GET /api/_healthcheck': [
    async () => json({ message: 'Success', app: 'OGENIC AI', version: '0.6-svg-material' }),
  ],
  'GET /api/system': [
    async () =>
      json({
        app: 'OGENIC AI',
        version: '0.6-svg-material',
        phase: 'VI',
        branch: 'phase-vi-provider-incentive-metering',
        runtime: 'AppDeploy managed backend',
        aiRuntime: 'AppDeploy AI runtime',
        exactModelExposed: false,
        toolGateway: 'Not connected',
      }),
  ],
  'POST /api/chat': [
    async ({ body }) => {
      const payload = body as { messages?: ChatMessage[]; memory?: string; agent?: AgentId };
      if (!Array.isArray(payload.messages) || payload.messages.length === 0)
        return error('messages_required', 400);

      const messages = payload.messages
        .filter(
          item =>
            item &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string'
        )
        .slice(-30)
        .map(item => ({
          role: item.role,
          content: item.content.slice(0, 12000),
        }));

      if (!messages.some(item => item.role === 'user' && item.content.trim()))
        return error('user_message_required', 400);

      const savedMemory = typeof payload.memory === 'string' ? payload.memory.slice(0, 10000) : '';
      const agent: AgentId = payload.agent && payload.agent in agentInstructions ? payload.agent : 'ogenic';

      try {
        const result = await ai.generate({
          system:
            canonicalContext +
            '\nActive agent mode:\n' +
            agentInstructions[agent] +
            '\nUser-saved context for this browser:\n' +
            savedMemory,
          messages,
          thinkingMode: 'DEEP',
          maxTokens: 2600,
          temperature: 0.25,
        });
        return json({ text: result.text, agent });
      } catch (caught) {
        console.error('OGENIC chat generation failed', caught);
        return error('ai_generation_failed', 502);
      }
    },
  ],
});
