# Yellow Effect Contract

- Stable operation identity binds capability, provider, target, scope, artifact identity and canonical arguments.
- Approval binds the exact execution envelope plus expiry, authorization version and resource version.
- Approval is revalidated immediately before execution.
- Unknown effect outcome is **not** safe to retry merely because time elapsed.
- Automatic retry is allowed only for a proven pre-effect failure, a proven not-committed outcome and remaining retry budget.
- Stale resource versions fail the write fence.
- The outcome ledger is evidence/state tracking, not an unconditional exactly-once guarantee.

Current canonical runtime remains read-only for live provider execution; future consequential adapters must use this guard before effect dispatch.
