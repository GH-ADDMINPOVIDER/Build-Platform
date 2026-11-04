# OGENIC / Unifiend — System Architecture Map

This is the **human first-view** architecture. It intentionally compresses OGE-1..80+ into functional domains so the control path is visible before implementation detail.

```mermaid
flowchart LR
  Unifiend["Unifiend / Human Surface"] --> ATHENA["ATHENA + BLUE / Admission & Planning"]
  ATHENA --> YELLOW["YELLOW / MA-OP / Execution Authority"]
  YELLOW --> CCS["CCS / Capability · Scope · Lease"]
  CCS --> VIOLET["VIOLET / Multi-Agent · Workflow"]
  VIOLET --> RUBY["RUBY / Verification · Evidence"]
  RUBY --> GREEN["GREEN / owner-main / 1LSS"]
  GREEN -. compact canonical context .-> ATHENA

  VIOLET --> CODEX["Codex"]
  VIOLET --> GEMINI["Gemini"]
  VIOLET --> MANUS["Manus bridge"]
  VIOLET --> N8N["n8n execution fabric"]

  CODEX --> RUBY
  GEMINI --> RUBY
  MANUS --> RUBY
  N8N --> RUBY

  YELLOW --> CF["Cloudflare runtime"]
  GH["GitHub code / branch / CI"] --> RUBY
  LIN["Linear task / delegation / result"] --> RUBY
  CF --> RUBY
  D1["D1 canonical operational state"] --> GREEN
```

## Reading the map

The solid center line is the authority/canonical path:

**Unifiend -> ATHENA/BLUE -> YELLOW -> CCS -> VIOLET -> RUBY -> GREEN/1LSS**

Parallel work can fan out under VIOLET, but execution authority does not fan out with it. Results must return through Ruby before canonical promotion.

See:
- [Functional grouping](./OGE_SYSTEM_GROUPS.md)
- [Machine-readable edges](./oge-system-edges.json)
- [Unifiend embed contract](./UNIFIEND_EMBED.md)
- [Standalone SVG](../../public/architecture/oge-system-map.svg)
