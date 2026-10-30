# GH-ADDMINPOVIDER: ตรวจบัญชีและ workflow วันที่ 30 ตุลาคม 2026

ตรวจ 4 repositories ของบัญชีจริง `Wave-Runner-2` ครบ 77 branch tips ที่เข้าถึงได้ รวม 45,864 file occurrences และ 2,547 text path/blob versions ที่ไม่ซ้ำ สแกนข้อความทุกไฟล์ที่อ่านเป็น UTF-8 ได้ พบ identity references ใน 494 path/blob versions ส่วน binary 14 blobs ลงทะเบียนแยกไว้ ไม่ได้อ้างว่าอ่านข้อความจากภาพหรือ binary แล้ว ไม่รวม commit เก่าและ branch ที่ลบไปแล้ว

`inventory.json` บอก repository, branch, commit และจำนวนไฟล์ที่ตรวจ `identity-references.json` บอก path, blob SHA, branches, เลขบรรทัด และชื่อที่พบ ไม่มี token values และไม่คัดลอกเนื้อหา source ทั้งบรรทัด

## ชื่อที่ใช้และสิทธิ์

| รายการ | ค่าที่ตรวจได้ / ข้อกำหนด |
| --- | --- |
| ชื่อปฏิบัติงานของ Owner | `GH-ADDMINPOVIDER` ตรงตัว |
| GitHub login จริง | `Wave-Runner-2`, user ID `342175560` |
| Repository หลักของ WAVE | `Wave-Runner-2/Build-Platform`, ID `1429580446` |
| Repository อีกตัวที่ชื่อคล้ายบทบาท | `Wave-Runner-2/GH_ADDMIN_POVIDER`, เป็นคนละ repository |
| GitHub connector metadata วันที่ตรวจ | `admin: true`, `push: true` ในทั้ง 4 repositories |
| Secret reference ที่ staging consumer อ่านอยู่ | `GH_ADDMINPROVIDER`; การมีชื่อใน source ยังไม่พิสูจน์ค่าปัจจุบันใน Infisical |
| Runner registration / physical host | `wave-runner-01` / `OCIAN-S-Host` เป็นคนละชนิดข้อมูลกับชื่อบัญชี |

ใช้ `config/github-provider.json` แยกชื่อแสดงผลออกจาก binding จริง ไม่เปลี่ยน username, URL, secret หรือ runner ด้วยการแทนข้อความทั้งหมด ชื่อ GitHub secret และตัวแปร shell ไม่รองรับขีดกลางแบบเดียวกับชื่อแสดงผล ส่วน `github.repository`, `github.token`, `GITHUB_TOKEN`, `issue_number` เป็นชื่อที่ระบบ/CLI ใช้ ไม่ใช่ชื่อย่อของบัญชี

## ปัญหาที่พบ

| จุด | ผลตรวจ source / runtime | สถานะแพตช์รอบนี้ |
| --- | --- | --- |
| `main/.github/workflows/wave-command-consumer.yml` | job guard และ shell guard ยังใช้ `Ogenicchocolate21debug/Build-Platform` ทำให้ไม่ผ่านบน repository ใหม่ | รายงานไว้; มีงานแก้ค้างใน PR #19 |
| `main/.github/workflows/codex-issue-runner.yml` | actor เก่า, ค้น credential aliases 5 ชื่อ, branch พิเศษผูก issue 54, migration ทำงานด้วย `always()`, ลบ local runner credential files ก่อนลงทะเบียนใหม่ | ยังไม่ได้รัน migration หรือเปลี่ยน runner |
| PR #19 / #20 workflow env | มี `\${{ vars.… }}` ใน YAML plain scalar จึงมี literal backslash ปนกับ expression ผลลัพธ์ ไม่ใช่ shell escaping ที่ถูกต้อง | ตรวจพบแยกจากปัญหาสิทธิ์ |
| PR #20 credential inventory | บังคับจำนวน credential references เท่ากับ 6 แม้จำนวนที่ถูกต้องอาจเปลี่ยน; inventory PASS ไม่ได้ตรวจ Actions write หรือ runner registration | ยังไม่อ้างว่า E2E |
| `worker/entry-yellow-stone.ts` และ `worker/local-agent-team-api.ts` | validator ยอมรับ run URLs ของ repository เก่าเพียงแห่งเดียว | เพิ่ม validator กลางให้รับ repository ปัจจุบันและ historical evidence ที่ระบุไว้ตรงตัว; URL เก่าไม่ถูกใช้ dispatch |
| `worker/mcp-config-api.ts` | read proof ยังส่ง owner ของ repository เก่า | ใช้ login จริงจาก binding กลาง |
| Certificate UI projection | label และ machine reference ปนเป็นชื่อเดียวกัน; permission/status หลายช่องเป็น snapshot ที่เขียนค้างใน source | ใช้ชื่อ `GH-ADDMINPOVIDER` กับ machine reference ที่แยกกัน; ไม่แปลงค่าค้างเป็น live PASS |
| Certificate branch `task/oge-128-runtime-certificate-20261018` | workflow OGE-128 จำนวน 13 ไฟล์ยังอ้าง repository เก่า; หลายตัวล็อก actor เก่าเช่นกัน | รายงานรายไฟล์ใน identity-references; ไม่แก้หลักฐานย้อนหลัง |
| `config/github-oidc.staging.json` | subject string มี repository ID `1350684572` แต่ GitHub metadata ของ repository ปัจจุบันคือ `1429580446` | ต้องตรวจ custom OIDC subject และ Infisical trust จริงก่อนแก้ ไม่สรุปว่าเป็นสาเหตุ login ล้มจาก source อย่างเดียว |
| `.github/scripts/patch_ogenic_host_runtime.py` | ใช้ exact string replacement แล้ว raise ถ้าหาโค้ดเก่าไม่เจอ; ไม่มี already-applied guard | ข้อความ raise ใน source ไม่ใช่ log ว่า Vercel ล่ม; การรันซ้ำอาจหยุดเมื่อ patch ไปแล้ว |
| Main Control Tower verifier | Vercel environment / Git provenance ใช้คืน `ready`; พิสูจน์ที่มาของ deployment ได้ แต่ยังไม่พิสูจน์ provider API operations | ยังไม่ใช้เป็นหลักฐานสิทธิ์หรือ E2E |
| AGENTS / authority docs | ยังมี permission `write` ตามวันที่เดิม | เพิ่มคำแก้ปัจจุบันว่า connector metadata เป็น admin; runtime credential grants ต้องตรวจแยก |

## Vercel และ Cloudflare ที่ตรวจสด

- `https://ogenic-registry-mcp.vercel.app/api/toolkit/status` ตอบ HTTP 200, `ready:false`, `mode:bootstrap-required`, `integrations.infisical:false` และตัวแปร `OGENIC_VAULT_KEY`, `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID` เป็น false ทั้งหมด
- Vercel project `ogenic-registry-mcp` ID `prj_ZLmba5Rwxfa0gPPqQdeUimJe2eao` มี deployment READY จริง ตรวจ env metadata แบบไม่ decrypt พบ 1 production entry ซึ่งชื่อไม่ตรงกับ bootstrap ทั้ง 4 ข้างต้น การที่ deployment READY ไม่ได้แปลว่า MCP auth พร้อม
- ในบัญชี Vercel มี 3 projects: `ogenic-registry-mcp`, `ogenic-control-tower`, `build-platform-ogenic-control-tower` เป็นคนละ project การตรวจผิด project จึงอาจรายงานสถานะผิดระบบ
- GET `https://wave.ogenicchocolate.com/api/health` และ `/api/system/certificate-lincenc` จาก Python HTTP client ในเครื่องตรวจนี้ตอบ 403, body `error code: 1010` ไม่ได้เข้าถึง authenticated D1 จึงไม่อ้างว่า backend/D1 ล่มหรือไม่มี binding
- CI run `40746602109`, job `123021930767`, source `4176c071da4a4b9a9514f32210ac519df4bc0369` ล้มที่ `Validate Phase VI toolkit` โดย log ระบุ `Possible plaintext secret assignment in worker/connector-modes-api.ts: TOKEN` งานนี้ยังไม่ได้ถึง deploy และข้อความ scanner ยังไม่ใช่หลักฐานว่ามี secret หลุดจริง

## `.yml` ทำงานอย่างไร

`.yml` และ `.yaml` เป็นรูปแบบไฟล์กำหนด workflow ไม่ใช่ process ที่วนรันเอง GitHub สร้าง run ใหม่เมื่อ event ใน `on:` เกิดขึ้น เช่น `workflow_dispatch`, `push`, `issues`, `schedule` สคริปต์ด้านในอาจใช้ครั้งเดียวหรือทำซ้ำได้ ต้องตรวจความสามารถในการรันซ้ำจากตัว script เอง

GitHub context และ numeric ID มีหน้าที่เฉพาะ `github.repository` คือ owner/repo ของ run; `github.actor` คือผู้เริ่ม run; `issue_number` คือหมายเลข issue; `run_id` คือหมายเลขงาน ไม่มีข้อกำหนดให้ตั้งชื่อบัญชีว่า GH2 ชื่อแสดงผลเขียนเต็มได้ ส่วน URL และ identity checks ต้องตรงบัญชีจริง

## การตรวจแพตช์

- Relevant tests: 41/41 PASS
- Typecheck: PASS
- Vite client + Worker build: PASS; สำเนาที่ใช้ตรวจไม่ดึง binary backgrounds 14 blobs จึงมี unresolved background warnings และไม่ได้ใช้สำเนานี้ deploy
- Full suite ก่อนแก้: 612 tests, 609 pass, 3 fail
- Full suite หลังแก้: 614 tests, 611 pass, 3 fail เดิม ได้แก่ private tool bridge resource lock, OGE-89 live evidence และ Manus plugin reviewer intake
- ไม่มีการ deploy, merge, เปลี่ยน Infisical values, เปลี่ยน permission หรือ re-register runner ในการตรวจนี้

## แหล่งข้อมูลตรง

- GitHub repositories + recursive Git trees + blob contents ผ่าน connector บัญชี `Wave-Runner-2`; text blobs ของ Build-Platform ตรวจ SHA-1 ตาม Git object format ก่อนอ่าน
- GitHub refs ทั้ง 71 สาขาของ Build-Platform และ refs ทั้ง 6 สาขาของอีก 3 public repositories
- [PR #19](https://github.com/Wave-Runner-2/Build-Platform/pull/19), [PR #20](https://github.com/Wave-Runner-2/Build-Platform/pull/20), [CI ที่ล้ม](https://github.com/Wave-Runner-2/Build-Platform/actions/runs/40746602109)
- Certificate JSON ที่ source SHA `6576035b2f3486ec9234ddc34f38b21b26e72a18` มี 28 evidence-history additions และไฟล์ CERT. LINCENC MAIN OWNNER ที่แนบมา 56 หน้า
- Vercel project/deployment/env metadata ผ่าน Vercel connector และ HTTP readiness ข้างต้น
- [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [GitHub contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts), [GitHub secret naming](https://docs.github.com/en/actions/reference/security/secrets)

ผลนี้คือการตรวจ source ทุก branch tip ที่ระบุ พร้อมแพตช์บางจุดที่ทดสอบได้ ไม่ใช่การรับรองว่าการเปลี่ยนชื่อทั้งระบบหรือ full-stack E2E เสร็จแล้ว
