# Owner code-change guard

The repository owner is the sole required reviewer for code changes:

- GitHub owner: `Ogenicchocolate21debug` (ID `306097555`)
- Required reviewer: `@Ogenicchocolate21debug`
- Protected staging branch: `phase-vi-provider-incentive-metering`
- Canonical runtime remains staging-only; this policy does not grant any new
  provider, secret, runner, or production permission.

`.github/CODEOWNERS` marks every file for the owner. The `Owner approval gate`
workflow checks the GitHub API without checking out PR code and fails unless the
owner's latest approval is for the current PR head SHA. A new commit therefore
requires a fresh owner approval.

For the rule to block merges, the repository owner must enable these GitHub
branch settings for `phase-vi-provider-incentive-metering` (and any other
branch intended to be protected):

1. Require a pull request before merging.
2. Require review from Code Owners.
3. Require one approval and dismiss stale approvals when a new commit is pushed.
4. Require the status check `Owner approval gate / owner-approval`.
5. Restrict direct pushes to `Ogenicchocolate21debug` (or leave direct pushes
   disabled and use an owner-created PR).

The source repository cannot change these GitHub settings by itself. Until the
settings are enabled, the workflow is an auditable failing check but a GitHub
administrator could still bypass it with a direct push or an administrative
override. No branch-protection API call was attempted because the available
GitHub token is invalid.
