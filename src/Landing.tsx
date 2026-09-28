export default function Landing() {
  const capabilities = [
    ["CHAT", "แชทใช้งานจริง", "คุยและสั่งงานผ่าน WAVE โดยใช้เส้น owner-main เดียวกัน"],
    ["1LSS", "จำและต่อบริบท", "D1 canonical memory ทำให้ Web + App ต่อจากเส้นเดิมได้"],
    ["AGENT", "Agent AI", "OpenAI Agent Session ทำงานผ่าน OGENIC HARNESS โดยไม่เปลี่ยนแกนระบบ"],
    ["TOOLS", "Tools + MCP", "เรียก GitHub, RAG, connectors และ capability ที่พร้อมใช้งานจากจุดเดียว"],
    ["LIVE", "Live execution", "เปิด browser / runtime surface ที่พร้อมใช้ พร้อม guard ก่อนงานเสี่ยง"],
    ["SYNC", "หลายช่องทาง", "WAVE เป็นหน้าบ้านเดียว ส่วน OGENIC HARNESS + 1LSS เป็นระบบหลังบ้านเดิม"],
  ];

  return <main className="olShell">
    <div className="olGlow" aria-hidden="true" />
    <header className="olTop">
      <a className="olBrand" href="/" aria-label="WAVE home">
        <img src="/assets/wave-logo.webp" alt="" />
        <span><b>WAVE</b><small>OGENIC HARNESS · 1LSS</small></span>
      </a>
      <span className="olPass">SAME MIND · LIVE</span>
    </header>

    <section className="olHero">
      <img className="olStone" src="/assets/wave-logo.webp" alt="WAVE green stone" />
      <p className="olEyebrow">WAVE · SAME MIND</p>
      <h1>Your AI,<br />in sync.</h1>
      <p className="olLead">คุย ทำงาน จัดการ ทุกอย่างในที่เดียว — หน้าบ้านคือ <b>WAVE</b> ส่วนระบบหลังบ้านยังเป็น <b>OGENIC HARNESS · capability · 1LSS</b> เหมือนเดิม</p>
      <div className="olActions">
        <a className="olPrimary" href="/chat">WAVE Chat <span>→</span></a>
        <a className="olSecondary" href="/app">App View <span>↗</span></a>
        <a className="olSecondary" href="/overview">WAVE Dashboard <span>↗</span></a>
      </div>
    </section>

    <section className="olCapabilityWrap">
      <div className="olSectionHead">
        <div><small>CAPABILITIES</small><h2>มากกว่าแค่แชท</h2></div>
        <span>OGENIC HARNESS · 1LSS</span>
      </div>
      <div className="olCapabilityGrid">
        {capabilities.map(([tag,title,body]) => <article key={tag}>
          <span>{tag}</span><b>{title}</b><small>{body}</small>
        </article>)}
      </div>
    </section>

    <footer className="olFooter">WAVE · POWERED BY OGENIC HARNESS · CAPABILITY · 1LSS</footer>
  </main>;
}
