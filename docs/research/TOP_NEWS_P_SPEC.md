# P-Spec — WAVE Top News (owner-only, read-only)

- **State:** implementation candidate on an isolated feature branch; no merge or deployment.
- **Source context:** the legacy Master Assistant Secret Gateway export contains a disabled/isolated “NEWS SUMMARY DEMO” based on RSS → OpenAI summary → Gmail. This implementation deliberately rebuilds only the safe readable surface; it does not activate that workflow or use its model/notification credentials.
- **Route:** /news (real React/HTML route in the WAVE application).
- **Read endpoint:** GET /api/top-news, owner/ops authenticated, Cache-Control: no-store.
- **Sources:** BBC World RSS (feeds.bbci.co.uk/news/world/rss.xml) and The Verge RSS (www.theverge.com/rss/index.xml); fixed allowlist only, HTTPS only, validated redirect hosts, bounded body/timeout, no arbitrary URL input.
- **Output:** headline, short sanitized summary, source attribution, publication time, validated source link, per-feed state. UI supports All / World / Technology filters and explicit refresh.
- **No hidden model invocation:** ai_summary=NOT_RUN; no OpenAI API/ChatGPT/Codex call, no n8n workflow activation, no email, no paid fan-out.
- **P-stack skills used for this bounded implementation:** #24 principle-fix-root-causes; #28 principle-make-operations-idempotent; #34 principle-prove-it-works; #37 principle-sequence-verifiable-units; #44 show-me-your-work. Pinned catalog SHA256 values: #24 ba4cd38da1dcc8fe5432feb64457cba95594736a9b21b2ebf8f8c52aee068707; #28 540738217c3da7bf513b9886924ad6a2bc77e58be867f5bd2e1831c74bf2ce70; #34 ec79a15025bac8d33d62011c54f3b612733fd2a024e623b531b3637aa75070e2; #37 2ccbbacc56ace5afdfb8670cef19d7bd009fb2a0033b9a741cbdf2b6baf72187; #44 4debc5860a7b389e4496f5b908340e4bb79cddabf36e5d56cab399a0a299df35.
- **Workflow queue scope:** Narrowed the dedicated OGE-125 connector proof so shared Worker entry-only changes do not trigger an unrelated connector-only self-hosted run; generic source validation remains responsible for unrelated entry routing.
- **Agent balance:** implementation lane is isolated on this branch. The scheduled Runner-2/Codex workflow is intentionally not dispatched, rerun, or modified. No separate agent was treated as available without a verified authenticated execution receipt. Independent CI/Ruby verdict remains a required later acceptance step.
- **Security boundary:** no secret value, D1 schema/data write, production/main/Candy source change, deploy, billing change, or permission change.
- **Acceptance:** route exists and links from WAVE landing; endpoint only fetches fixed RSS sources for an owner session; error/partial-source states are truthful; unit/contract tests and typecheck/build pass on the exact feature SHA before proposing merge; live availability remains unverified until a later approved staging deployment and owner-auth request.


## Check-in / Check-out receipt

- **CHECK-IN:** 2026-10-14; task: turn the existing disabled/isolated news-demo idea into a real WAVE HTML route and guarded RSS endpoint; branch `feat/top-news-owner-rss-ui`; worktree/scope limited to this PR.
- **CHECK-IN constraints:** preserve the user's scheduled Runner-2/Codex feedback run; no manual rerun/dispatch; staging branch only; no main/production/Candy/D1 schema/secrets/deploy/billing changes.
- **CHECK-OUT:** latest source SHA at handoff is recorded by the PR head; page/API/spec/tests are committed in this branch and the PR remains Draft. Earlier proof SHA `7e54fa2cef731d2cb289b0661644ec08deff54c3` passed 529 tests, typecheck and build. The latest-head generic audit run has no retrievable logs/step receipt, so exact-head CI is **NOT VERIFIED**.
- **Open gates:** repeatable exact-head CI evidence; independent Ruby/audit review; authorized staging deployment + browser/runtime proof for live RSS reachability. Do not mark DONE or merge until those gates are evidenced.
- **Continuation pointer:** PR #30, current branch `feat/top-news-owner-rss-ui`, P-Spec `docs/research/TOP_NEWS_P_SPEC.md`, decision trail `docs/research/TOP_NEWS_DECISIONS.tsv`.
