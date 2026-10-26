const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
if (!apiKey) {
  console.error('CONFIGURATION_REQUIRED:OPENAI_API_KEY');
  process.exit(2);
}

const task = process.argv.slice(2).join(' ').trim() || String(process.env.OGENIC_AGENT_TASK || '').trim() || [
  'Inspect the current workspace for OGENIC Phase VI.',
  'Work only on staging and only on branch phase-vi-provider-incentive-metering.',
  'Never touch main or production. Never deploy, delete remote resources, change billing, or expose secrets.',
  'Run the strongest useful local verification available: install only when required, then test, typecheck, and build.',
  'Fix implementation issues in the workspace when safe, re-run verification, and save concise evidence under /workspace/outputs.',
  'If the Build-Platform source is not present in the workspace, stop and report CONFIGURATION_REQUIRED:WORKSPACE_SOURCE instead of guessing.'
].join(' ');

const body = {
  agent: {
    model: 'gpt-6-astra',
    instructions: [
      'You are the OGENIC Phase VI staging implementation agent.',
      'Use the OpenAI-hosted execution environment aggressively for code inspection, shell commands, tests, typechecking, builds, and safe workspace edits.',
      'Staging guardrail: the only allowed target repository is Wave-Runner-2/Build-Platform and the only allowed branch is phase-vi-provider-incentive-metering.',
      'Never modify main/prod, never deploy production, never delete remote resources, never change billing/account permissions, and never reveal credentials.',
      'Treat any production-affecting or irreversible action as HUMAN_APPROVAL_REQUIRED.',
      'Prefer evidence over claims. A completed turn is not success unless the relevant commands actually passed.',
      'Write useful logs, diffs, and summaries to /workspace/outputs when possible.'
    ].join(' '),
    reasoning: { effort: 'high', summary: 'concise' },
    multi_agent: { enabled: true, max_concurrent_subagents: 4 },
    service_tier: 'auto'
  },
  environment: { type: 'openai_hosted' },
  input: task,
  metadata: {
    project: 'ogenic-phase-vi',
    environment: 'staging',
    branch: 'phase-vi-provider-incentive-metering'
  },
  stream: true
};

const response = await fetch('https://api.openai.com/v1/agents/sessions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'OpenAI-Beta': 'agents=v1',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
});

if (!response.ok || !response.body) {
  const text = await response.text().catch(() => '');
  console.error(`OPENAI_AGENT_HTTP_${response.status}: ${text.slice(0, 1000)}`);
  process.exit(1);
}

const decoder = new TextDecoder();
let buffer = '';
let sessionId = null;
let terminal = null;
let finalTexts = [];
let streamedText = '';
let commandFailures = [];

function consume(event) {
  if (!event || typeof event !== 'object') return;
  if (typeof event.session_id === 'string') sessionId = event.session_id;
  if (event.type === 'agent.session.turn.output_text.delta' && typeof event.delta === 'string') {
    streamedText += event.delta;
  }
  if (event.type === 'agent.session.turn.output_text.done' && typeof event.text === 'string') {
    const text = event.text.trim();
    if (text) finalTexts.push(text);
  }

  if (event.type === 'agent.session.turn.item.done' && event.item) {
    const item = event.item;
    if (item.type === 'message' && Array.isArray(item.content)) {
      const text = item.content
        .filter((part) => part && part.type === 'output_text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim();
      if (text) {
        if (item.phase === 'final_answer') finalTexts.push(text);
        console.log(`[assistant${item.phase ? `:${item.phase}` : ''}] ${text}`);
      }
    }
    if (item.type === 'command_execution') {
      const summary = `${item.command || 'command'} -> ${item.status || 'unknown'}${Number.isInteger(item.exit_code) ? ` (exit ${item.exit_code})` : ''}`;
      console.log(`[command] ${summary}`);
      if (item.status === 'failed' || (Number.isInteger(item.exit_code) && item.exit_code !== 0)) commandFailures.push(summary);
    }
  }

  const rootTurn = event.turn?.subagent_id == null;
  if (event.type === 'agent.session.turn.completed' && rootTurn) terminal = 'completed';
  if ((event.type === 'agent.session.turn.failed' && rootTurn) || event.type === 'agent.session.failed' || event.type === 'agent.session.environment.failed' || event.type === 'error') terminal = 'failed';
  if (event.type === 'agent.session.turn.cancelled' && rootTurn) terminal = 'cancelled';
}

for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
  let split;
  while ((split = buffer.indexOf('\n\n')) >= 0) {
    const block = buffer.slice(0, split);
    buffer = buffer.slice(split + 2);
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try { consume(JSON.parse(payload)); } catch { /* ignore non-JSON keepalive/event lines */ }
    }
  }
}

buffer += decoder.decode().replace(/\r\n/g, '\n');
if (buffer.trim()) {
  for (const line of buffer.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try { consume(JSON.parse(payload)); } catch { /* ignore trailing non-JSON event lines */ }
  }
}

if (sessionId) console.log(`SESSION_ID=${sessionId}`);
if (finalTexts.length || streamedText.trim()) console.log(`FINAL=${finalTexts.at(-1) || streamedText.trim()}`);
if (terminal !== 'completed') {
  console.error(`AGENT_TERMINAL=${terminal || 'unknown'}`);
  process.exit(1);
}
if (commandFailures.length) {
  console.error(`VERIFICATION_FAILED=${commandFailures.join(' | ')}`);
  process.exit(1);
}
console.log('AGENT_TERMINAL=completed');
