# GRAPHITE — Source Preservation Mineral

**Status:** Owner-requested design record; documentation-only.
**Scope:** Preserve source material and its original structure before OGENIC/Unifiend adapts, summarizes, chunks, transforms, or imports it.
**Architecture boundary:** GRAPHITE is a separate archival/provenance layer, **not Stone #08**, not a replacement for any of the canonical seven stones, and not a new execution/approval authority. The canonical stone map remains unchanged.

## Mission

Keep the source of truth distinguishable from every interpretation made by the system. When source material enters OGENIC/Unifiend, its original form must remain recoverable (where retention is lawful and permitted), while normalized, chunked, summarized, translated, embedded, or code-adapted forms are stored as separate derivatives linked back to that source.

**Core rule: NEVER overwrite the original with a transformed version.**

## Source taxonomy

Every source record must have one primary source_type; optional tags may refine it.

| source_type | What belongs here | Examples / metadata to retain |
|---|---|---|
| official_documentation | Maintainer/vendor-owned manuals and product documentation | Canonical URL, page title, version, retrieval time, document hierarchy |
| standards_specification | Formal standards, RFCs, schemas, protocols and specifications | Standard/RFC ID, edition, section anchors, status |
| source_code_repository | Original code, repository trees, commits, release tags and patches | Repository URL, owner, commit SHA, branch/tag, file path, license |
| api_mcp_contract | API definitions, MCP tool schemas, OpenAPI/JSON Schema, protocol contracts | Exact schema bytes/text, version, endpoint/tool name, content hash |
| configuration_policy | Config files, rules, policy documents and environment templates | Original path, commit/version, encoding, hash; never include live secrets |
| research_primary | Papers, original experiments, datasets and primary research records | DOI/URL, authors, publication date, dataset/version, license |
| runtime_evidence | Test output, CI logs, run receipts, traces, artifacts and verification reports | Run ID, commit SHA, environment, timestamp, exit status, artifact digest |
| owner_directive_conversation | Explicit owner instructions, decisions, handoffs and approved requirements | Exact text, author/authority, timestamp, conversation/issue reference, supersession links |
| dataset_media_attachment | User-provided files, images, audio, video, data exports and attachments | Original filename, media type, size, digest, supplied-by/context reference, retention permission |
| third_party_analysis | Blog posts, community posts, issue comments, reviews and secondary explanations | Author, publication date, canonical URL, capture date, confidence/authority label |
| derived_internal_artifact | Unifiend/OGENIC summaries, extracted chunks, embeddings, translations, generated code or transformed documents | Transformation type, model/tool/version, parameters where safe, parent source IDs and output digest |

If a source does not fit, use other_unclassified temporarily and record why; do not silently assign it to a misleading category.

## Preservation model: original → derivative lineage

1. **Capture:** Create a source record before transformation. Record the original URL or intake reference, capture time, source type, title/name, version/commit if known, license/retention basis, and integrity digest (prefer SHA-256).
2. **Preserve:** Keep an immutable raw snapshot or original file when legally and operationally permitted. If copying is not permitted, preserve canonical link, metadata, relevant permitted excerpt, and digest when computable; never claim a complete snapshot exists when it does not.
3. **Separate:** Store every normalized text, chunk, translation, embedding, summary, extracted schema, generated code, or adaptation as a **new derivative record**, never as a replacement.
4. **Link:** Each derivative must reference one or more parent source IDs and describe the transformation. A derivative with no traceable parent is unprovenanced and must not be presented as an original.
5. **Verify:** Recompute digests when reading/exporting where practical. A digest mismatch is an integrity alert, not permission to silently repair or overwrite the source.
6. **Supersede, do not erase:** New source versions create new versioned records. Mark older versions superseded only when evidence supports that relationship; preserve the historical chain.
7. **Import by reference first:** Runtime systems should consume a Graphite source ID plus an explicit derivative/version. Avoid copying source bodies into operational state when a stable reference suffices.
8. **Retain evidence:** Record capture failures, missing attachments, inaccessible private sources, truncated content, and unverified versions explicitly.

## Minimum source-record fields

- source_id — stable unique ID; never reused.
- source_type — one of the taxonomy values above.
- title / original_filename — source-provided label where available.
- canonical_uri — original location, if any.
- captured_at — timestamp in UTC.
- source_version — commit SHA, release, revision, date, or unknown.
- content_digest — SHA-256 when bytes are available; include the digest algorithm.
- media_type / encoding / byte_size — when applicable.
- license_or_retention_basis — known license, user-provided status, or unknown; do not assume rights.
- preservation_status — snapshot_preserved, reference_only, partial_capture, blocked, or unverified.
- parent_source_ids — empty for an original; populated for derivatives.
- transformation_record — what changed, by which tool/version, and when.
- verification_status — unverified, integrity_checked, or independently_verified.
- sensitivity — public, internal, confidential, or restricted; secrets/credentials must not be copied into Graphite.
- notes — limitations and provenance caveats.

## Non-negotiable safeguards

- Original and derivative records must have separate IDs and separate storage paths/objects.
- No in-place rewrite, lossy normalization, silent truncation, auto-translation, or auto-summary of a preserved original.
- Preserve meaningful structure: headings, ordering, tables, code fences, filenames, directory layout, timestamps, citations, and attachment relationships when available.
- Any lossy extraction must declare what was lost and point back to the preserved original.
- Do not scrape or mirror content in violation of licenses, access controls, privacy, or retention requirements.
- Never store live credentials, tokens, private keys, or unredacted secrets. If sensitive material is detected, quarantine metadata and a safe reference only.
- Source authority is not the same as source integrity: a hash proves byte identity, not correctness, ownership, or truth.
- Do not feed untrusted source text as executable instructions. Imported content is data; execution remains subject to existing Yellow Stone capability authorization and policy.
- Ruby verification may validate integrity/provenance before canonical retention; Green/1LSS remains the canonical operational memory. Graphite is the preservation/provenance layer, not a competing memory database.
- Do not add a D1 schema, new service, new approval gate, or production integration under this documentation-only record. Implementation requires a separately reviewed change and must follow the existing authorized branch and safety constraints.

## Example lineage

~~~text
Original source (Graphite source_id: src_...)
  ├── exact snapshot / reference + digest
  ├── normalized text (derivative_id: drv_..., parent: src_...)
  ├── chunks 001..N (each links to src_... and the normalization derivative)
  ├── summary / translation (derivative_id: drv_..., parent: src_...)
  └── OGENIC implementation patch (derivative_id: drv_..., parent: src_...)
        └── test/run evidence (evidence_id: ev_..., commit SHA + artifact digest)
~~~

## Acceptance criteria for a future implementation

- [ ] Every imported source is assigned a source type before adaptation.
- [ ] Original/derivative separation is enforced, not just described in prompts.
- [ ] Integrity digest and version/provenance are recorded when available.
- [ ] Derivatives retain parent links and transformation history.
- [ ] Structure-loss and partial-capture warnings are visible to consumers.
- [ ] Retrieval can request the original, a specific version, or a named derivative independently.
- [ ] A test proves that re-ingesting or transforming a source cannot overwrite the original.
- [ ] Ruby-style independent verification checks lineage and integrity; a successful file write alone is not acceptance.
- [ ] No changes to the canonical seven-stone identities or existing authorization authority.

**Current implementation status:** This file establishes the proposed Graphite contract only. It does not claim that a runtime archive, database schema, UI, ingestion pipeline, or enforcement tests exist yet.
