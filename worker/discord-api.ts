import { Hono } from "hono";
import { hasOwnerOrOpsAccess, hasOwnerSession, type AuthBindings } from "./app-auth";

type DiscordBindings = AuthBindings & {
  DISCORD_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
};
type DiscordEnv = { Bindings: DiscordBindings };
type DiscordResult = { ok: boolean; status: number; data: any };
type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  topic?: string | null;
  position?: number;
  last_message_id?: string | null;
};
type WorkspaceRoom = { name: string; topic: string };
type WorkspaceGroup = { name: string; rooms: WorkspaceRoom[] };
type SafeHttpStatus = 403 | 404 | 429 | 502 | 503;

const DISCORD_API = "https://discord.com/api/v10";
const GUILD_ID_FALLBACK = "1558544234082996338";
const SNOWFLAKE = /^\d{17,20}$/;

const WORKSPACE: WorkspaceGroup[] = [
  {
    name: "00 HOME & INDEX",
    rooms: [
      { name: "start-here", topic: "OGENIC WAVE workspace guide, operating rules and quick links." },
      { name: "announcements", topic: "Owner-approved workspace announcements and important changes." },
      { name: "workspace-index", topic: "Index of projects, docs, task boards, logs and agent lanes." },
    ],
  },
  {
    name: "01 KNOWLEDGE BASE",
    rooms: [
      { name: "documents", topic: "Canonical documents, references and working notes." },
      { name: "sop-and-guides", topic: "Standard operating procedures, runbooks and how-to guides." },
      { name: "architecture", topic: "System architecture, integration maps and technical design." },
      { name: "decisions", topic: "Decision records with context, owner and outcome." },
    ],
  },
  {
    name: "02 PROJECTS & TASKS",
    rooms: [
      { name: "project-board", topic: "Project-level status, milestones and work breakdowns." },
      { name: "task-updates", topic: "Task handoffs, progress updates and closure evidence." },
      { name: "backlog", topic: "Unstarted work and ideas awaiting prioritization." },
    ],
  },
  {
    name: "03 OPERATIONS & LOGS",
    rooms: [
      { name: "deploy-log", topic: "Staging/production deployment receipts, commit SHAs and verification links." },
      { name: "workflow-log", topic: "Automation runs, runner results and job summaries." },
      { name: "alerts", topic: "Actionable system alerts; include impact and evidence." },
      { name: "incidents", topic: "Incident timeline, diagnosis, remediation and postmortem." },
    ],
  },
  {
    name: "04 AGENT CONTROL",
    rooms: [
      { name: "wave-commands", topic: "Owner requests for WAVE/OGENIC. Do not post credentials." },
      { name: "agent-runs", topic: "Agent execution summaries, run IDs and verified artifacts." },
      { name: "approval-queue", topic: "Actions waiting for explicit owner approval." },
    ],
  },
  {
    name: "05 FILES & ARCHIVE",
    rooms: [
      { name: "screenshots", topic: "Screenshots and visual issue reports with reproduction details." },
      { name: "json-artifacts", topic: "JSON payloads, API samples and structured diagnostic files." },
      { name: "archive", topic: "Historical records retained for lookup; never store secrets." },
    ],
  },
];

function guildId(env: DiscordBindings) {
  const id = String(env.DISCORD_GUILD_ID ?? GUILD_ID_FALLBACK).trim();
  return SNOWFLAKE.test(id) ? id : "";
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === new URL(request.url).origin) return true;
  return (request.headers.get("x-ogenic-client") ?? "").trim().toLowerCase() === "native";
}

function safeChannel(channel: DiscordChannel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parent_id: channel.parent_id ?? null,
    topic: channel.topic ?? null,
    position: Number(channel.position ?? 0),
    last_message_id: channel.last_message_id ?? null,
  };
}

async function discordRequest(env: DiscordBindings, path: string, init: RequestInit = {}): Promise<DiscordResult> {
  const token = String(env.DISCORD_TOKEN ?? "").trim();
  if (!token) return { ok: false, status: 503, data: { code: "DISCORD_TOKEN_MISSING" } };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bot " + token);
    headers.set("User-Agent", "OGENIC-WAVE (https://wave.ogenicchocolate.com, 1.0)");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await fetch(DISCORD_API + path, { ...init, headers, redirect: "error" });
    } catch {
      return { ok: false, status: 502, data: { code: "DISCORD_NETWORK_ERROR" } };
    }

    const data = response.status === 204 ? null : await response.json().catch(() => null) as any;
    if (response.status === 429 && attempt < 2) {
      const retrySeconds = Number(data?.retry_after ?? 1);
      const waitMs = Math.min(Math.max(retrySeconds, 0.25), 3) * 1000 + 150;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    return { ok: response.ok, status: response.status, data };
  }
  return { ok: false, status: 429, data: { code: "DISCORD_RATE_LIMITED" } };
}

function clientStatus(status: number): SafeHttpStatus {
  if (status === 403) return 403;
  if (status === 404) return 404;
  if (status === 429) return 429;
  if (status === 503) return 503;
  return 502;
}

async function readGuildChannels(env: DiscordBindings) {
  const id = guildId(env);
  if (!id) return { ok: false, status: 503, code: "DISCORD_GUILD_ID_INVALID", channels: [] as DiscordChannel[] };
  const result = await discordRequest(env, "/guilds/" + id + "/channels");
  if (!result.ok || !Array.isArray(result.data)) {
    return {
      ok: false,
      status: result.status,
      code: result.status === 401 ? "DISCORD_TOKEN_INVALID"
        : result.status === 403 || result.status === 404 ? "DISCORD_GUILD_ACCESS_REQUIRED"
        : result.status === 429 ? "DISCORD_RATE_LIMITED"
        : "DISCORD_CHANNEL_LIST_FAILED",
      channels: [] as DiscordChannel[],
    };
  }
  return { ok: true, status: 200, code: "OK", channels: result.data as DiscordChannel[] };
}

function messageSummary(message: any) {
  return {
    id: String(message?.id ?? ""),
    content: String(message?.content ?? ""),
    timestamp: String(message?.timestamp ?? ""),
    edited_timestamp: message?.edited_timestamp ? String(message.edited_timestamp) : null,
    author: {
      id: String(message?.author?.id ?? ""),
      username: String(message?.author?.username ?? "unknown"),
      global_name: message?.author?.global_name ? String(message.author.global_name) : null,
      bot: Boolean(message?.author?.bot),
    },
    attachments: Array.isArray(message?.attachments) ? message.attachments.map((file: any) => ({
      id: String(file?.id ?? ""),
      filename: String(file?.filename ?? "attachment"),
      content_type: file?.content_type ? String(file.content_type) : null,
      size: Number(file?.size ?? 0),
      url: String(file?.url ?? ""),
      proxy_url: file?.proxy_url ? String(file.proxy_url) : null,
      width: Number.isFinite(file?.width) ? Number(file.width) : null,
      height: Number.isFinite(file?.height) ? Number(file.height) : null,
    })) : [],
    embeds: Array.isArray(message?.embeds) ? message.embeds.map((embed: any) => ({
      title: embed?.title ? String(embed.title) : null,
      description: embed?.description ? String(embed.description) : null,
      url: embed?.url ? String(embed.url) : null,
    })) : [],
  };
}

function requestErrorCode(status: number) {
  if (status === 401) return "DISCORD_TOKEN_INVALID";
  if (status === 403) return "DISCORD_PERMISSION_DENIED";
  if (status === 404) return "DISCORD_RESOURCE_NOT_FOUND";
  if (status === 429) return "DISCORD_RATE_LIMITED";
  if (status >= 500) return "DISCORD_UPSTREAM_ERROR";
  return "DISCORD_REQUEST_FAILED";
}

function auditReason() {
  return encodeURIComponent("Owner-approved OGENIC WAVE workspace setup");
}

export function createDiscordApi() {
  const api = new Hono<DiscordEnv>();

  api.use("/api/discord/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    await next();
  });

  api.get("/api/discord/status", async (c) => {
    const id = guildId(c.env);
    if (!String(c.env.DISCORD_TOKEN ?? "").trim()) {
      return c.json({ ok: false, state: "NOT_CONFIGURED", code: "CONFIGURATION_REQUIRED", missing: "DISCORD_TOKEN" }, 503);
    }
    if (!id) return c.json({ ok: false, state: "NOT_CONFIGURED", code: "DISCORD_GUILD_ID_INVALID" }, 503);

    const [botResult, guildResult, channelResult] = await Promise.all([
      discordRequest(c.env, "/users/@me"),
      discordRequest(c.env, "/guilds/" + id + "?with_counts=true"),
      readGuildChannels(c.env),
    ]);

    if (!botResult.ok || !botResult.data?.id || botResult.data?.bot !== true) {
      return c.json({
        ok: false,
        state: "TOKEN_INVALID",
        code: requestErrorCode(botResult.status),
        message: "Discord rejected the bot credential. Check DISCORD_TOKEN in Infisical.",
      }, 502);
    }

    const bot = {
      id: String(botResult.data.id),
      username: String(botResult.data.username ?? "unknown"),
      global_name: botResult.data.global_name ? String(botResult.data.global_name) : null,
    };

    if (!guildResult.ok || !channelResult.ok) {
      return c.json({
        ok: false,
        state: "BOT_GUILD_ACCESS_REQUIRED",
        code: "DISCORD_GUILD_ACCESS_REQUIRED",
        bot,
        guild_id: id,
        message: "Bot token is valid, but Nika Wave cannot read the configured server. Confirm the bot is a member and can view channels.",
      }, 200);
    }

    const guild = guildResult.data as any;
    const channels = channelResult.channels;
    return c.json({
      ok: true,
      state: "CONNECTED",
      bot,
      guild: {
        id: String(guild.id),
        name: String(guild.name ?? "Discord server"),
        approximate_member_count: Number(guild.approximate_member_count ?? 0),
        channel_count: channels.length,
        category_count: channels.filter((channel) => channel.type === 4).length,
        forum_count: channels.filter((channel) => channel.type === 15).length,
      },
      channels: channels.map(safeChannel).sort((left, right) => left.position - right.position || left.name.localeCompare(right.name)),
      capabilities: {
        read_channels: true,
        read_messages: true,
        read_attachment_metadata: true,
        create_channels: true,
        send_messages: true,
        realtime_gateway: false,
      },
    });
  });

  api.get("/api/discord/channels", async (c) => {
    const result = await readGuildChannels(c.env);
    if (!result.ok) {
      return c.json({ ok: false, code: result.code, message: "Could not read channels from the configured Discord server." }, clientStatus(result.status));
    }
    return c.json({
      ok: true,
      guild_id: guildId(c.env),
      channels: result.channels.map(safeChannel).sort((left, right) => left.position - right.position || left.name.localeCompare(right.name)),
    });
  });

  api.get("/api/discord/channels/:channelId/messages", async (c) => {
    const channelId = c.req.param("channelId");
    if (!SNOWFLAKE.test(channelId)) return c.json({ ok: false, code: "INVALID_CHANNEL_ID" }, 400);
    const channels = await readGuildChannels(c.env);
    if (!channels.ok) return c.json({ ok: false, code: channels.code, message: "Could not verify the channel belongs to the configured server." }, clientStatus(channels.status));
    if (!channels.channels.some((channel) => channel.id === channelId && (channel.type === 0 || channel.type === 5 || channel.type === 15))) {
      return c.json({ ok: false, code: "CHANNEL_NOT_IN_CONFIGURED_GUILD" }, 404);
    }

    const requested = Number(c.req.query("limit") ?? 20);
    const limit = Number.isFinite(requested) ? Math.min(50, Math.max(1, Math.floor(requested))) : 20;
    const result = await discordRequest(c.env, "/channels/" + channelId + "/messages?limit=" + limit);
    if (!result.ok || !Array.isArray(result.data)) {
      return c.json({ ok: false, code: requestErrorCode(result.status), message: "Could not read messages from this Discord channel." }, clientStatus(result.status));
    }
    return c.json({ ok: true, channel_id: channelId, messages: result.data.map(messageSummary) });
  });

  api.post("/api/discord/channels/:channelId/messages", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ ok: false, code: "ORIGIN_DENIED" }, 403);
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "OWNER_SESSION_REQUIRED" }, 401);
    }
    const channelId = c.req.param("channelId");
    if (!SNOWFLAKE.test(channelId)) return c.json({ ok: false, code: "INVALID_CHANNEL_ID" }, 400);
    const body = await c.req.json<{ content?: unknown }>().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return c.json({ ok: false, code: "MESSAGE_CONTENT_REQUIRED" }, 400);
    if (new TextEncoder().encode(content).byteLength > 1800) {
      return c.json({ ok: false, code: "MESSAGE_TOO_LARGE", max_bytes: 1800 }, 413);
    }

    const channels = await readGuildChannels(c.env);
    if (!channels.ok) return c.json({ ok: false, code: channels.code }, clientStatus(channels.status));
    if (!channels.channels.some((channel) => channel.id === channelId && (channel.type === 0 || channel.type === 5 || channel.type === 15))) {
      return c.json({ ok: false, code: "CHANNEL_NOT_IN_CONFIGURED_GUILD" }, 404);
    }

    const result = await discordRequest(c.env, "/channels/" + channelId + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!result.ok || !result.data?.id) {
      return c.json({ ok: false, code: requestErrorCode(result.status), message: "Discord could not send the message." }, clientStatus(result.status));
    }
    return c.json({ ok: true, message: messageSummary(result.data) }, 201);
  });

  api.post("/api/discord/workspace/bootstrap", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ ok: false, code: "ORIGIN_DENIED" }, 403);
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "OWNER_SESSION_REQUIRED" }, 401);
    }

    const id = guildId(c.env);
    if (!String(c.env.DISCORD_TOKEN ?? "").trim()) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "DISCORD_TOKEN" }, 503);
    }
    if (!id) return c.json({ ok: false, code: "DISCORD_GUILD_ID_INVALID" }, 503);

    const guildResult = await discordRequest(c.env, "/guilds/" + id);
    if (!guildResult.ok) {
      return c.json({
        ok: false,
        code: requestErrorCode(guildResult.status),
        message: "Nika Wave cannot access the configured server. Verify the server ID and bot membership.",
      }, clientStatus(guildResult.status));
    }

    const existingResult = await readGuildChannels(c.env);
    if (!existingResult.ok) return c.json({ ok: false, code: existingResult.code, message: "Could not list existing channels." }, clientStatus(existingResult.status));

    const current: DiscordChannel[] = [...existingResult.channels];
    const created: Array<{ name: string; type: string; id: string; parent_id: string | null }> = [];
    const reused: Array<{ name: string; type: string; id: string }> = [];
    const issues: Array<{ name: string; stage: string; code: string }> = [];
    let welcomePosted = false;

    async function createDiscordChannel(name: string, type: number, parentId?: string, topic?: string) {
      const payload: Record<string, unknown> = { name, type };
      if (parentId) payload.parent_id = parentId;
      if (topic) payload.topic = topic;
      const result = await discordRequest(c.env, "/guilds/" + id + "/channels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Audit-Log-Reason": auditReason(),
        },
        body: JSON.stringify(payload),
      });
      if (!result.ok || !result.data?.id) return { ok: false as const, status: result.status, data: null };
      const channel = result.data as DiscordChannel;
      current.push(channel);
      created.push({ name: channel.name, type: type === 4 ? "category" : "text", id: channel.id, parent_id: channel.parent_id ?? null });
      return { ok: true as const, status: result.status, data: channel };
    }

    for (const group of WORKSPACE) {
      let category = current.find((channel) => channel.type === 4 && channel.name === group.name);
      if (category) {
        reused.push({ name: category.name, type: "category", id: category.id });
      } else {
        const categoryResult = await createDiscordChannel(group.name, 4);
        if (!categoryResult.ok) {
          issues.push({ name: group.name, stage: "category", code: requestErrorCode(categoryResult.status) });
          continue;
        }
        category = categoryResult.data;
      }

      for (const room of group.rooms) {
        const existing = current.find((channel) => channel.type === 0 && channel.name === room.name);
        if (existing) {
          reused.push({ name: existing.name, type: "text", id: existing.id });
          if ((existing.parent_id ?? null) !== category.id) {
            issues.push({ name: existing.name, stage: "placement", code: "EXISTS_IN_DIFFERENT_CATEGORY" });
          }
          continue;
        }
        const roomResult = await createDiscordChannel(room.name, 0, category.id, room.topic);
        if (!roomResult.ok) {
          issues.push({ name: room.name, stage: "channel", code: requestErrorCode(roomResult.status) });
          continue;
        }
        if (room.name === "start-here") {
          const welcome = await discordRequest(c.env, "/channels/" + roomResult.data.id + "/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: "OGENIC WAVE workspace initialized. Start in #workspace-index. Use the knowledge rooms for durable notes, project rooms for work, and Operations & Logs for deployment/workflow receipts. Never post API keys, bot tokens, passwords or other secrets in Discord.",
              allowed_mentions: { parse: [] },
            }),
          });
          welcomePosted = welcome.ok;
          if (!welcome.ok) issues.push({ name: "start-here", stage: "welcome", code: requestErrorCode(welcome.status) });
        }
      }
    }

    const after = await readGuildChannels(c.env);
    return c.json({
      ok: after.ok && issues.length === 0,
      state: after.ok && issues.length === 0 ? "BOOTSTRAPPED" : "PARTIAL",
      guild: { id, name: String(guildResult.data?.name ?? "Discord server") },
      created_count: created.length,
      reused_count: reused.length,
      issues,
      created,
      reused,
      welcome_posted: welcomePosted,
      channel_count: after.ok ? after.channels.length : current.length,
      channels: (after.ok ? after.channels : current).map(safeChannel).sort((left, right) => left.position - right.position || left.name.localeCompare(right.name)),
      retry_safe: true,
      note: "Re-run safely to create missing rooms. Existing rooms are reused and never moved or deleted automatically.",
    }, after.ok && issues.length === 0 ? 200 : 207);
  });

  return api;
}
