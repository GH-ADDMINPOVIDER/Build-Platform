# WF command system

Canonical grammar:

```text
/WF.<AREA>.database<SPACE>.<APP>.<RESOURCE>.<ACTION>
```

Optional segments may be omitted only for global commands.

## Global commands

| Command | Outcome |
|---|---|
| `/WF.help` | List supported commands, required connectors, and safety class. |
| `/WF.index` | Open the WorkFlow database index and report connected surfaces. |
| `/WF.sync.status` | Show the latest source, targets, counts, failures, and sync time. |
| `/WF.audit.latest` | Show the latest Drive, GitHub, build, and deployment audit. |
| `/WF.rollback.plan` | Prepare a recoverable rollback without executing it. |

## Drive coverage

Actions: `find`, `list`, `metadata`, `copy`, `move`, `rename`, `save`, `version`, `share`, `export`, `sync`, `status`, `audit`.

Examples:

```text
/WF.Photo.databaseCandy.Shopify.list
/WF.Photo.databaseCandy.Shopify.save
/WF.Photo.databaseCandy.Cloudflare.sync
/WF.Photo.databaseCandy.MainPhoto.audit
/WF.Code.databaseCandy.GitHub.filemd.save
/WF.Code.databaseCandy.GitHub.filezip.version
/WF.Credential.databaseIndex.LINE-OA.link
/WF.OperateSecret.check
/WF.Tool.GodMode.find
```

Drive root: `WorkFlow(Work) DATA BASE`.

Photo source/targets:

- Source: `Photo Candy/Cloudflare`
- Target: `Photo Candy/Shopify`
- Master: `Main Photo`

Sync is idempotent and append-only by default. Match each item by category plus filename plus MIME type plus size. Copy missing files. If the same name has different bytes or size, create a versioned copy and report the conflict. Never silently overwrite or delete.

## Real-time boundary

Use a supported webhook when available. Google Drive has no event webhook in the current ChatGPT automation connector, so the closest supported automatic mode is hourly polling. Each run should report only changes or failures.
