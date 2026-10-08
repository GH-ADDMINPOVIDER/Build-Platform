# CCS Authority Contract

- Child/effective authority cannot exceed parent provider, capability, permission, environment, expiry or egress scope.
- Revocation is lineage-aware and cached references fail closed after ancestor revocation.
- Invocation authorization is independent from discovery.
- Egress is checked against normalized allowed origins.
- Public authority metadata excludes credential-bearing fields.
- Runtime credential custody remains brokered; references must use `vault://` or `binding://` forms.
- No hidden cross-provider fallback.

The current live CCS surface remains a bounded/read-oriented control facade. Future side-effecting adapters must call the invocation authorization boundary before provider execution.
