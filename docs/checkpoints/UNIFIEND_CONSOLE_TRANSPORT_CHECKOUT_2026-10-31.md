Unifiend Console transport correction, 31 October 2026.

The Owner's earlier auth probe failed inside nested sudo login-shell invocation before either CLI login status executed. This is a command-transport failure, not evidence that either Codex session expired. The Owner Console also reports the existing service active. Its historical unit name does not independently establish its current repository binding; inspect WorkingDirectory/.runner public metadata before changing it.

Source 20ad7bd77d2e2042e022a51029c3d8aa3d652b99 adds scripts/unifiend-console-status.sh using sudo -H -u ACCOUNT /bin/bash -s with a literal stdin heredoc. No nested login-shell command string. It reports allowlisted CLI status and public repository-binding metadata, suppresses raw auth output, and disables the service pager. No credential/profile/service/registration was changed.

Local suite: 642 passed, 1 sudo regression skipped because this sandbox maps only UID 0; no failures. The real sudo transport regression then ran on Ubuntu Cloud run 41162780039: all 29 access tests passed, zero skips. Cloud source validation 41162783823 passed. This tests the transport with fake CLIs; it does not establish the host's real account login state.

ATHENA and original certificate integrity verified. Existing-task checkpoint independently read back from D1: github-actions://1429580446/41162780039, hash 03e5f455799db2e2c540c3a14f6307659f1cf4f1d24b7827f9542e1d1be66f28. Verified host pin remains valid; encrypted client key still requires unlock for SSH. Continue in the already-open Console. Press q to leave the pager, then run the corrected read-only status script. No new Codex login requested.

p-stack: 19 Build the lever; 24 Fix root causes; 34 Prove it works; 50 Unslop. Overall In Progress.
