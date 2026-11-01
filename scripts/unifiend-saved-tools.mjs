const owners = ["Wave-Runner-2"];
const relevant = /terminal|ssh|opencode|codex|copilot|vscode|code-server|tmux|zellij|shell|webssh|tty|devcontainer|codespace|wezterm|ghostty|tabby|xterm/i;

// Read-only discovery scoped to the sole operational GitHub account.
export async function inspectSavedTools({ request, headers }) {
  const reports = [];
  for (const owner of owners) {
    const report = { owner, state: "READ_UNAVAILABLE", inspected_count: 0, complete: false, starred: [], tools: [] };
    reports.push(report);
    try {
      for (let page = 1; page <= 3; page++) {
        const response = await request(`https://api.github.com/users/${owner}/starred?per_page=100&page=${page}`, {
          headers, redirect: "manual", signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) { report.http_status = response.status; break; }
        const rows = await response.json();
        if (!Array.isArray(rows)) break;
        report.inspected_count += rows.length;
        for (const row of rows) {
          if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row?.full_name || "")) continue;
          report.starred.push({ full_name: row.full_name, url: `https://github.com/${row.full_name}` });
          if (relevant.test(row.full_name + " " + (typeof row.description === "string" ? row.description : ""))) {
            report.tools.push({ full_name: row.full_name, url: `https://github.com/${row.full_name}` });
          }
        }
        report.state = "VERIFIED_READ";
        if (rows.length < 100) { report.complete = true; break; }
      }
    } catch { report.state = "READ_INCOMPLETE"; }
  }
  return reports;
}
