import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  topic: string | null;
  position: number;
  last_message_id: string | null;
};
type DiscordStatus = {
  ok?: boolean;
  state?: string;
  code?: string;
  message?: string;
  missing?: string;
  bot?: { id: string; username: string; global_name?: string | null };
  guild?: { id: string; name: string; approximate_member_count: number; channel_count: number; category_count: number; forum_count: number };
  guild_id?: string;
  channels?: DiscordChannel[];
};
type DiscordMessage = {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name?: string | null; bot: boolean };
  attachments: Array<{ id: string; filename: string; content_type: string | null; size: number; url: string; proxy_url?: string | null; width?: number | null; height?: number | null }>;
  embeds: Array<{ title?: string | null; description?: string | null; url?: string | null }>;
};
type BootstrapResult = {
  ok?: boolean;
  state?: string;
  guild?: { id: string; name: string };
  created_count?: number;
  reused_count?: number;
  issues?: Array<{ name: string; stage: string; code: string }>;
  welcome_posted?: boolean;
  retry_safe?: boolean;
  note?: string;
};
type ApiError = { code?: string; message?: string; state?: string; missing?: string };

function timeLabel(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
function formatSize(size: number) {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / 1024 / 1024).toFixed(1) + " MB";
}
function channelType(type: number) {
  if (type === 4) return "CATEGORY";
  if (type === 15) return "FORUM";
  if (type === 5) return "ANNOUNCEMENTS";
  return "TEXT";
}

export default function DiscordWorkspacePanel() {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [messages, setMessages] = useState<DiscordMessage[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<DiscordChannel | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [report, setReport] = useState<BootstrapResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/discord/status", { credentials: "same-origin", cache: "no-store" });
      const body = await response.json().catch(() => ({})) as DiscordStatus;
      setStatus(body);
      if (!response.ok) {
        setChannels([]);
        setMessages([]);
        return;
      }
      if (body.ok && Array.isArray(body.channels)) {
        setChannels(body.channels);
        setNotice("");
        setSelectedChannel((current) => current ? body.channels?.find((item) => item.id === current.id) ?? current : null);
      } else {
        setChannels([]);
        setMessages([]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Discord status check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(
    () => channels.filter((channel) => channel.type === 4).sort((a, b) => a.position - b.position),
    [channels],
  );

  async function bootstrap() {
    const accepted = window.confirm(
      "Create the OGENIC Unifiend Notion-style workspace inside " +
      (status?.guild?.name || "the configured Discord server") +
      "? Existing rooms will be reused. No existing channel will be moved or deleted."
    );
    if (!accepted || busy) return;
    setBusy("bootstrap");
    setError("");
    setNotice("");
    setReport(null);
    try {
      const response = await fetch("/api/discord/workspace/bootstrap", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await response.json().catch(() => ({})) as BootstrapResult & ApiError;
      if (!response.ok && response.status !== 207) {
        throw new Error(body.message || body.code || "Discord workspace setup failed");
      }
      setReport(body);
      setNotice(
        "Workspace setup: " + String(body.created_count ?? 0) + " created, " +
        String(body.reused_count ?? 0) + " reused" +
        (body.issues?.length ? ", " + body.issues.length + " issue(s) to review." : ".")
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Discord workspace setup failed");
    } finally {
      setBusy("");
    }
  }

  async function readMessages(channel: DiscordChannel) {
    setSelectedChannel(channel);
    setBusy("messages:" + channel.id);
    setError("");
    setMessages([]);
    try {
      const response = await fetch(
        "/api/discord/channels/" + encodeURIComponent(channel.id) + "/messages?limit=20",
        { credentials: "same-origin", cache: "no-store" },
      );
      const body = await response.json().catch(() => ({})) as { ok?: boolean; messages?: DiscordMessage[]; code?: string; message?: string };
      if (!response.ok || !body.ok) throw new Error(body.message || body.code || "Could not read channel messages");
      setMessages(Array.isArray(body.messages) ? body.messages : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read channel messages");
    } finally {
      setBusy("");
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedChannel || !draft.trim() || busy) return;
    setBusy("send");
    setError("");
    try {
      const response = await fetch(
        "/api/discord/channels/" + encodeURIComponent(selectedChannel.id) + "/messages",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draft.trim() }),
        },
      );
      const body = await response.json().catch(() => ({})) as { ok?: boolean; code?: string; message?: string };
      if (!response.ok || !body.ok) throw new Error(body.message || body.code || "Could not send message");
      setDraft("");
      await readMessages(selectedChannel);
      setNotice("Message sent to #" + selectedChannel.name + ".");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send message");
    } finally {
      setBusy("");
    }
  }

  const currentGuild = status?.guild;
  const currentBot = status?.bot;
  const connected = Boolean(status?.ok && status.state === "CONNECTED" && currentGuild && currentBot);

  return <section className="discordWorkspace" aria-label="Discord workspace integration">
    <header className="discordWorkspaceHead">
      <div>
        <span className="wdEyebrow">Unifiend CONNECTOR · DISCORD API</span>
        <h2>Discord Workspace</h2>
        <p>Notion-style channels, knowledge rooms, project boards and operational logs.</p>
      </div>
      <div className="discordWorkspaceActions">
        <span className={"discordState " + (connected ? "isConnected" : "isPending")}>{connected ? "CONNECTED" : (status?.state || "CHECKING")}</span>
        <button onClick={() => void load()} disabled={loading || Boolean(busy)}>{loading ? "Checking…" : "Refresh"}</button>
      </div>
    </header>

    {error && <div className="discordFeedback discordFeedbackError">{error}</div>}
    {notice && <div className="discordFeedback discordFeedbackSuccess">{notice}</div>}

    {!status && !error && <div className="discordEmpty">Checking Discord bot and server access…</div>}

    {status && !connected && <div className="discordSetupHint">
      <strong>{status.code || status.state || "Discord not connected"}</strong>
      <p>{status.message || (status.missing === "DISCORD_TOKEN"
        ? "DISCORD_TOKEN has not reached the Unifiend Worker yet. The staging deployment must publish the binding first."
        : "Refresh after confirming that Nika Unifiend is invited to the configured server.")}</p>
      {status.missing && <small>Missing binding: {status.missing}</small>}
    </div>}

    {connected && currentGuild && currentBot && <>
      <div className="discordMetricGrid">
        <article><small>BOT</small><strong>{currentBot.global_name || currentBot.username}</strong><span>{currentBot.id}</span></article>
        <article><small>SERVER</small><strong>{currentGuild.name}</strong><span>{currentGuild.id}</span></article>
        <article><small>CHANNELS</small><strong>{currentGuild.channel_count}</strong><span>{currentGuild.category_count} categories · {currentGuild.forum_count} forums</span></article>
      </div>

      <div className="discordWorkspaceTools">
        <div><b>Workspace structure</b><p>Creates missing categories and rooms only. Existing rooms are reused; mismatched room placement is reported but not changed automatically.</p></div>
        <button className="discordPrimaryButton" disabled={Boolean(busy) || loading} onClick={() => void bootstrap()}>
          {busy === "bootstrap" ? "Creating workspace…" : report?.issues?.length ? "Retry missing rooms" : "Create Notion-style workspace"}
        </button>
      </div>

      {report && <div className={"discordReport " + (report.issues?.length ? "hasIssues" : "")}>
        <strong>{report.state || "Workspace setup report"}</strong>
        <span>{report.created_count ?? 0} created · {report.reused_count ?? 0} reused · welcome {report.welcome_posted ? "posted" : "not needed or not posted"}</span>
        {report.issues?.length ? <ul>{report.issues.map((item, index) =>
          <li key={item.name + item.stage + index}><code>{item.name}</code> — {item.stage}: {item.code}</li>
        )}</ul> : null}
        {report.note && <small>{report.note}</small>}
      </div>}

      <div className="discordBrowser">
        <div className="discordChannelPane">
          <div className="discordPaneHeading"><b>Channels</b><small>{channels.length} visible</small></div>
          {categories.map((category) => <div className="discordCategoryGroup" key={category.id}>
            <div className="discordCategoryLabel">{category.name}</div>
            {channels.filter((channel) => channel.parent_id === category.id && channel.type !== 4)
              .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
              .map((channel) => <button
                className={"discordChannelButton " + (selectedChannel?.id === channel.id ? "isSelected" : "")}
                key={channel.id}
                onClick={() => void readMessages(channel)}
                disabled={Boolean(busy)}
              >
                <span><i>#</i>{channel.name}</span><small>{channelType(channel.type)}</small>
              </button>)}
          </div>)}
          {channels.filter((channel) => channel.type !== 4 && !channel.parent_id).map((channel) =>
            <button className="discordChannelButton" key={channel.id} onClick={() => void readMessages(channel)} disabled={Boolean(busy)}>
              <span><i>#</i>{channel.name}</span><small>{channelType(channel.type)}</small>
            </button>
          )}
          {!channels.length && <div className="discordEmpty">No accessible channels returned.</div>}
        </div>

        <div className="discordMessagePane">
          <div className="discordPaneHeading">
            <b>{selectedChannel ? "#" + selectedChannel.name : "Message preview"}</b>
            <small>{selectedChannel ? "Latest 20 messages" : "Choose a channel"}</small>
          </div>
          {!selectedChannel && <div className="discordEmpty">Choose a text channel to inspect messages, images and file attachments.</div>}
          {selectedChannel && busy === "messages:" + selectedChannel.id && <div className="discordEmpty">Reading messages…</div>}
          {selectedChannel && busy !== "messages:" + selectedChannel.id && !messages.length && <div className="discordEmpty">No messages returned. This channel may be empty.</div>}
          {messages.map((message) => <article className="discordMessage" key={message.id}>
            <div className="discordMessageMeta"><b>{message.author.global_name || message.author.username}</b><time>{timeLabel(message.timestamp)}</time></div>
            {message.content && <p className="discordMessageText">{message.content}</p>}
            {message.embeds.map((embed, index) => <div className="discordEmbed" key={message.id + "-embed-" + index}>
              {embed.title && <b>{embed.title}</b>}
              {embed.description && <p>{embed.description}</p>}
              {embed.url && <a href={embed.url} target="_blank" rel="noreferrer">Open embed link ↗</a>}
            </div>)}
            {message.attachments.map((attachment) => <div className="discordAttachment" key={attachment.id}>
              {attachment.content_type?.startsWith("image/") && <a href={attachment.url} target="_blank" rel="noreferrer"><img src={attachment.proxy_url || attachment.url} alt={attachment.filename} loading="lazy" /></a>}
              <a href={attachment.url} target="_blank" rel="noreferrer">{attachment.filename}</a>
              <small>{attachment.content_type || "file"} · {formatSize(attachment.size)}</small>
            </div>)}
          </article>)}
          {selectedChannel && <form className="discordSendForm" onSubmit={sendMessage}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1800} placeholder={"Send a message to #" + selectedChannel.name} disabled={Boolean(busy)} />
            <button type="submit" disabled={!draft.trim() || Boolean(busy)}>{busy === "send" ? "Sending…" : "Send"}</button>
          </form>}
        </div>
      </div>
    </>}

    <footer className="discordWorkspaceFoot">
      <span>Owner-authenticated API · Token stays server-side</span>
      <span>REST verified · live Gateway monitoring not enabled yet</span>
    </footer>
  </section>;
}
