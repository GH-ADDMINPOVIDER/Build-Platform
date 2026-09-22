export default function Landing() {
  return <main className="olShell">
    <div className="olGlow" aria-hidden="true" />
    <header className="olTop">
      <a className="olBrand" href="/" aria-label="OGENIC home">
        <img src="/ogenic-harness-mark.svg" alt="" />
        <span><b>OGENIC CORE</b><small>HARNESS · PHASE VI</small></span>
      </a>
      <span className="olPass">PHASE VI · PASS</span>
    </header>

    <section className="olHero">
      <img className="olStone" src="/ogenic-harness-mark.svg" alt="OGENIC D1 stone mark" />
      <p className="olEyebrow">OWNER SYSTEM · SAME MIND · 1LSS</p>
      <h1>One web door.<br />One canonical mind.</h1>
      <p className="olLead">เข้าเว็บก่อน แล้วเลือกเข้า SAME MIND chat, app view หรือ operator overview ได้จากหน้าเดียว โดยใช้ owner-main และ D1 line เดียวกัน</p>
      <div className="olActions">
        <a className="olPrimary" href="/chat">Open SAME MIND Chat <span>→</span></a>
        <a className="olSecondary" href="/app">Open App View <span>↗</span></a>
        <a className="olSecondary" href="/overview">Operator Overview <span>↗</span></a>
      </div>
    </section>

    <section className="olStatus">
      <article><span>01</span><b>SAME MIND</b><small>Web + App share the canonical 1LSS line</small></article>
      <article><span>02</span><b>D1 MEMORY</b><small>owner-main state stays behind the chat surface</small></article>
      <article><span>03</span><b>AGENT AI</b><small>OpenAI Agent Session remains available inside chat</small></article>
    </section>

    <footer className="olFooter">OGENIC CORE — HARNESS · PRIVATE OWNER SURFACE</footer>
  </main>;
}
