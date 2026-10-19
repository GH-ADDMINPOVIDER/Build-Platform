type PolicySection = { id: string; number: string; title: string; paragraphs: string[] };

const sections: PolicySection[] = [
  {
    id: "accountability", number: "01", title: "Architecture and execution accountability",
    paragraphs: [
      "WAVE separates user intent, agent planning, Owner authorization, controlled execution, and verification. A proposed action is not an executed action. The existing governance route is Connector Endpoint → WAVE Command → ATHENA → Yellow Stone → Owner approval → controlled runner execution → operational verification and evidence recording.",
      "Operational authority remains with the authenticated Owner and the policy-controlled execution service. Agents and connectors do not independently acquire authority to perform privileged operations."
    ]
  },
  {
    id: "identity", number: "02", title: "Identity and authentication",
    paragraphs: [
      "Owner sessions, delegated client access, and machine-to-machine identities are distinct security contexts. WAVE uses authenticated Owner sessions for sensitive approval decisions and scopes machine integrations to their authorized environment.",
      "The architecture includes short-lived machine authentication and server-side credential references. A successful authentication test for one integration is not proof of access to all connected services."
    ]
  },
  {
    id: "approval", number: "03", title: "Human approval and decision boundaries",
    paragraphs: [
      "Changes that require execution authority must pass the Yellow Stone policy gate and an explicit Owner confirmation tied to the proposed plan. An agent recommendation, generated instruction, external message, or forged approval reference does not constitute Owner consent.",
      "Policy checks must fail closed when a required authorization, capability, or trustworthy execution receipt is missing. Production changes require a separate, explicit authorization."
    ]
  },
  {
    id: "permissions", number: "04", title: "Agent permissions and execution limits",
    paragraphs: [
      "Agent roles, connector scopes, and tool permissions limit what each identity may request. Read-only access does not imply write access; a registered tool does not establish live provider authorization; and a planned task does not establish a completed action.",
      "Commands requiring host execution are constrained to the existing authorized execution path. WAVE does not authorize standalone shell execution through MCP, npm, NPX, or an agent relay outside that boundary."
    ]
  },
  {
    id: "secrets", number: "05", title: "Secrets and credential protection",
    paragraphs: [
      "Infisical is used for managed machine identity, secret references, and certificate lifecycle controls. GitHub records source and workflow provenance, while canonical runtime evidence is recorded separately.",
      "Public pages and evidence summaries must not contain private keys, raw tokens, OAuth credentials, passwords, session material, or sensitive Owner data. Credential access is subject to explicit scopes, rotation, and revocation controls."
    ]
  },
  {
    id: "connectors", number: "06", title: "Connector, MCP, and agent relay security",
    paragraphs: [
      "WAVE's connector architecture accommodates MCP, API and SDK integrations, event-driven invocation, and controlled agent messaging. Each interface is assessed independently for source implementation, contract testing, live connection, authorized execution, and end-to-end evidence.",
      "Remote agent messages are treated as untrusted input, not as instructions that can override policy. OAuth, MCP, and A2A features still under staging review must not be presented as universally deployed or verified."
    ]
  },
  {
    id: "evidence", number: "07", title: "Logging, integrity, and auditability",
    paragraphs: [
      "WAVE uses source control, workflow run provenance, bounded operational records, and integrity checks to support traceable verification. Runtime results should be associated with their authorized identity, environment, source revision, run reference, and outcome when available.",
      "An integrity readback proves the integrity of the specifically tested record within the tested scope. It does not, by itself, prove universal provider coverage, permanent availability, or a complete historical security audit."
    ]
  },
  {
    id: "certificates", number: "08", title: "Certificates, authorization, and revocation",
    paragraphs: [
      "WAVE distinguishes an internal evidence-backed authorization record from a cryptographically issued certificate. Internal evidence records are not government-issued certificates, independent compliance accreditations, or public X.509 certificates.",
      "Owner authorization remains revocable. Cryptographic credentials, when issued, have their own validity, renewal, and revocation requirements; indefinite authorization records must never be interpreted as indefinitely valid private keys or leaf certificates."
    ]
  },
  {
    id: "data", number: "09", title: "Data handling and retention principles",
    paragraphs: [
      "Operational evidence should contain only the information necessary to establish an authorized event, an outcome, or an integrity check. Raw credentials and unnecessary sensitive content must be excluded from public disclosures.",
      "Retention and deletion depend on the applicable system, provider, and authorization policy. WAVE does not publish a universal retention duration or guarantee comprehensive erasure across connected third-party systems without independently verified evidence."
    ]
  }
];

const verification = [
  ["Certificate record integrity", "VERIFIED IN STAGING", "A specific canonical certificate document was written to and read back from staging evidence storage with matching SHA-256."],
  ["Connector inventory and contracts", "SOURCE / CONTRACT", "Multiple integration categories have source mappings and selected passing contract checks. This is not universal live-provider certification."],
  ["Owner-approved command execution", "NOT FULLY VERIFIED", "The complete Owner confirmation → runner execution → final evidence receipt sequence remains subject to a live, authorized end-to-end proof."],
  ["External mTLS and cross-agent exchange", "NOT VERIFIED", "External mTLS end-to-end and separately authenticated cross-account agent relay have not been established as generally complete."],
  ["Security audit", "PARTIAL", "Bounded security and cleanup checks exist; a full historical security audit is not claimed."],
  ["Infisical / evidence-store mirroring", "NOT VERIFIED", "Document integrity readback does not establish full, bidirectional JSON mirroring between Infisical and the evidence store."]
] as const;

export default function WavePolicy() {
  return <main className="wvShell wavePolicyRoot" id="top">
    <header className="wvTop wavePolicyTop">
      <a className="wvBrand" href="/" aria-label="WAVE home">
        <img src="/assets/wave-logo.webp" alt="" />
        <span><b>WAVE</b><small>HUMAN DECISION · AI EXECUTION</small></span>
      </a>
      <nav aria-label="WAVE policy navigation" className="wavePolicyTopLinks">
        <a href="/">HOME</a><a href="/command">COMMAND</a><a href="#security">SECURITY</a><a href="#verification">VERIFICATION</a>
      </nav>
    </header>
    <div className="wavePolicyLayout">
      <div className="wavePolicyHero">
        <p className="wavePolicyEyebrow">OGENIC WAVE · PUBLIC OPERATING POLICY · 19 OCTOBER 2026</p>
        <h1>Policy, Security <span>&amp; Trust.</span></h1>
        <p className="wavePolicyLead">How WAVE governs AI-assisted operations, protects access boundaries, and distinguishes documented safeguards from verified runtime outcomes.</p>
        <p className="wavePolicyDisclosure">This is a technical policy and verification disclosure. It is not a claim of government certification, independent accreditation, or blanket security compliance.</p>
      </div>
      <nav className="wavePolicyContents" aria-label="Policy sections">
        <a href="#policy">OPERATING POLICY</a><a href="#security">SECURITY CONTROLS</a><a href="#verification">TRUST &amp; VERIFICATION</a><a href="#limitations">LIMITATIONS</a>
      </nav>
      <section id="policy" className="wavePolicySections" aria-labelledby="wavePolicyPolicyHeading">
        <div className="wavePolicySectionHeading"><p>GOVERNANCE</p><h2 id="wavePolicyPolicyHeading">Operating policy</h2></div>
        {sections.map((section) => <article className="wavePolicyArticle" key={section.id} id={section.id}>
          <span className="wavePolicyNumber" aria-hidden="true">{section.number}</span>
          <div><h3>{section.title}</h3>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        </article>)}
      </section>
      <section className="wavePolicySection" id="security" aria-labelledby="wavePolicySecurityHeading">
        <div className="wavePolicySectionHeading"><p>CONTROL BOUNDARIES</p><h2 id="wavePolicySecurityHeading">Security is enforced at the authorization boundary.</h2></div>
        <div className="wavePolicyThree">
          <article><b>IDENTITY</b><h3>Authenticate the actor</h3><p>Owner and machine identities are scoped separately. Connected clients must not gain privileges from their interface alone.</p></article>
          <article><b>APPROVAL</b><h3>Authorize the specific plan</h3><p>Privileged work requires a valid Owner decision through Yellow Stone. Agent output cannot replace an Owner signature.</p></article>
          <article><b>RECEIPT</b><h3>Verify the actual result</h3><p>Source code, passing tests, and successful runtime execution are different evidence levels and are reported separately.</p></article>
        </div>
      </section>
      <section className="wavePolicySection" id="verification" aria-labelledby="wavePolicyVerificationHeading">
        <div className="wavePolicySectionHeading"><p>EVIDENCE-FIRST DISCLOSURE</p><h2 id="wavePolicyVerificationHeading">Trust &amp; verification status</h2></div>
        <p className="wavePolicyIntro">The statements below refer to the bounded staging checkpoint dated 19 October 2026. They are not live status indicators and must not be read as real-time service availability.</p>
        <div className="wavePolicyStatusList">
          {verification.map(([name, status, explanation]) => <article key={name}>
            <div><h3>{name}</h3><span className="wavePolicyStatus">{status}</span></div>
            <p>{explanation}</p>
          </article>)}
        </div>
      </section>
      <section className="wavePolicySection wavePolicyLimits" id="limitations" aria-labelledby="wavePolicyLimitsHeading">
        <div className="wavePolicySectionHeading"><p>DISCLOSURE LIMITS</p><h2 id="wavePolicyLimitsHeading">What this page does not certify</h2></div>
        <p>WAVE does not claim that every connector is live, all permissions are tested, external mTLS is verified end to end, agent messages prove Owner identity, or all runtime actions are complete. No production deployment, universal Infisical-to-evidence-store mirroring, full historical leak assurance, or completed security accreditation is implied.</p>
        <p>Public policy excludes detailed host identifiers, privileged authentication paths, private infrastructure topology, raw evidence records, and credential values. Internal operational receipts are reviewed through authorized project channels.</p>
      </section>
    </div>
    <footer className="wvFooter wavePolicyFooter"><span>© OGENIC WAVE · OFFICIAL TECHNICAL POLICY</span><a href="/">RETURN TO WAVE ↗</a></footer>
  </main>;
}
