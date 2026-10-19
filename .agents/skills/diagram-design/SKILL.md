---
name: diagram-design
description: Create maintainable architecture and product diagrams from natural-language briefs and existing repository sources.
---

# OGENIC Diagram Design

Use this skill when a task asks for an architecture map, system flow, workflow diagram, data-flow view, UI diagram, or diagram artifact in HTML/SVG.

## Existing OGENIC architecture

Read the existing sources before drawing:
- `docs/architecture/OGE_SYSTEM_MAP.md`
- `docs/architecture/OGE_SYSTEM_MAP.mmd`
- `docs/architecture/oge-system-edges.json`
- `docs/architecture/WAVE_EMBED.md`
- `public/architecture/oge-system-map.svg`

Treat them as a coordinated map. Update the existing source instead of creating a competing map. Keep the canonical control path and authority boundaries intact:
`WAVE → ATHENA/BLUE → YELLOW/MA-OP → CCS → VIOLET → RUBY → GREEN/1LSS`.

## Output rules

1. Start with editable Mermaid or structured data; make HTML/SVG a derived, inspectable output.
2. Use concise labels, meaningful grouping, a legend where needed, accessible titles and alt text.
3. For mobile, preserve mobile-readable horizontal pan when labels would otherwise become unreadable.
4. Prefer monochrome by default with an optional light/dark presentation when supported.
5. For repository changes, update the editable source and machine-readable edges together, then use the existing renderer/build path for derived SVG.
6. Only produce PNG when an existing renderer is available. Do not claim a file exists until it has been written and inspected.
7. Do not upload private repository contents to third-party diagram services. Do not add a server or dependency just to draw a diagram.
8. Link claims to the source files or commit that supports them. Label conceptual or unverified nodes clearly.

This is an OGENIC-authored adapter inspired by [Diagram Design](https://github.com/cathrynlavery/diagram-design), whose repository declares the MIT license. It does not install or vendor the upstream plugin.
