# Ruby -> Green Canonical Contract

- Generated, research or provider-derived artifacts carry provenance and source references.
- Green promotion requires Ruby PASS, Ruby as verifier, evidence references and an explicit terminal trust owner.
- Compact handoffs keep hash, provenance, evidence references and bounded summary; they do not require full transcript replay.
- Provider session state is a projection/continuation aid. Existing Green/1LSS state wins reconciliation conflicts.
- Verification evidence and recovery state are separate concepts.
- Deletion/retention receipts remain incomplete when provider-side confirmation is unavailable.
- No verifier-on-verifier recursion is introduced.

These primitives define the gate without adding a new persistence layer or D1 schema.
