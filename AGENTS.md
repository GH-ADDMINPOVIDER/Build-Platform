# AGENTS.md — อ่านก่อนทำงานทุกครั้ง (Claude, GPT, Jules และเอเจนต์อื่น)

อัปเดต: 2026-11-06 โดย Claude ตามที่ Owner สั่ง ไฟล์นี้อยู่ใน repo Public: ห้ามใส่ secret, token, รหัสผ่าน หรือค่าที่เป็นความลับทุกชนิด

## Owner และวิธีทำงาน
- Txmdy ทำคนเดียว เป็นเจ้าของระบบ ใช้มือถืออย่างเดียว ไม่เขียนโค้ด
- ตอบสั้น ภาษาไทยสบายๆ
- เรียกบัญชี/เครื่องด้วยชื่อจริงเสมอ ห้ามใช้คำย่อที่ Owner ตั้งเอง (Owner เรียกได้คนเดียว)
- Owner อนุมัติสิทธิ์กว้างบน GitHub และ Infisical ไว้แล้ว ไม่ต้องถามซ้ำ ไม่ต้องลดสิทธิ์

## ห้ามเด็ดขาด
- พิมพ์/บันทึกค่า secret ลง log, แชท, commit, cert
- แก้ cert แบบทับของเดิม (ต่อท้ายอย่างเดียว)
- รายงานว่า PASS โดยไม่มี run id และ job id

## ชื่อจริง
- บัญชีปัจจุบัน: GH-ADDMINPOVIDER (ID 342175560)
- บัญชีเก่า (archive): Ogenicchocolate21debug
- เครื่องเดิม: OCIAN-S-Host หมดอายุ 2026-11-05 ตัวรันงานบนเครื่องนั้น (label GH-ADDMINPOVIDER) ไม่รับงานแล้ว (EV-072)

## เส้นทางงานตอนนี้ (ไม่ใช้ SSH)
GitHub Actions บนเครื่องของ GitHub (ubuntu-latest) -> Infisical ผ่าน OIDC -> Cloudflare (D1 ชื่อ ogenic-phase-vi-staging)
- Infisical: base https://app.infisical.com, project e8cfba67-ea99-4d79-bc9f-87b862f9129c, environment staging, audience https://github.com/GH-ADDMINPOVIDER
- เครื่องของ GitHub ถูกทิ้งหลังจบ job: ผลลัพธ์ต้องเขียนออกไปที่ D1 หรือ artifact ห้ามเก็บไว้ในเครื่อง
- กฎใน D1 (policy_rules) ที่ต้องทำตาม: cloudflare-primary, d1-canonical-state, infisical-secret-source, no-raw-secrets, read-before-write, minimal-reversible-diff

## หลักฐานและ cert
- cert v2 (Google Sheet ID 1zYJw3C-9bnIK5CDJ8hN1qjZonAbg51R6GhXLnLcBlRw) เพิ่มต่อท้ายอย่างเดียว
- PASS ต้องมี run id และ job id
- E2E ต้องครบ: input -> execute -> output -> อ่านย้อนกลับอย่างอิสระ ถ้าไม่ครบให้ติดป้าย PROCESS_BLUE ไม่ใช่ PASS
- รูปแบบตอบผล (แนะนำ): `PASS|FAIL | run id | job id | ค่าที่อ่านย้อนกลับ` ถ้าไม่ผ่านให้ตอบ `FAIL + จุดที่ติด` บรรทัดเดียว ไม่ต้องพูดวน

## สถานะเกต
- Owner ปิดเกต Yellow/Ruby ชั่วคราว (2026-11-05) เพื่อให้คำสั่งวิ่งได้ แผนคือเปลี่ยนเป็นโหมดจดอย่างเดียวก่อน แล้วเปิดบล็อกทีละเกต ยังไม่เริ่ม รอ Owner สั่ง

## เอเจนต์ที่เขียนโค้ด
- ทำงานผ่าน branch และ PR เท่านั้น ห้าม push ตรงเข้า main โดยไม่ได้รับสั่ง
- Claude เป็นผู้ตรวจและรวม ห้ามแก้ไฟล์ workflow ที่เกี่ยวกับ OIDC/Infisical โดยไม่แจ้ง

## Self-hosted job machine rules
- Workflows that target the self-hosted label (GH-ADDMINPOVIDER) must never get a `pull_request` or `pull_request_target` trigger. Allowed triggers: `workflow_dispatch`, `push` limited by `paths`, `issues` with an owner check.
- The Railway container definition lives in `railway/gh-agent/`. It holds no secrets; `GH_PAT` and `GH_REPO` are Railway variables.
- When source code is Windows-first or desktop-first, convert it to mobile-first (control from the phone, run on Cloudflare or GitHub, store results in D1).
