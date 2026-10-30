import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const draft = read("src/composer-draft.ts");
const attachments = read("src/ComposerAttachments.tsx");
const chat = read("src/UnifiedChat.tsx");
const css = read("src/unified-chat.css");

test("selected attachment is persisted before network upload", () => {
  assert.match(draft, /await this\.persist\(\).*await this\.retry\(row\.localId\)/s);
  assert.match(draft, /indexedDB\.open\("unifiend-unsent-drafts"/);
  assert.match(draft, /localStorage\.setItem\(textKey, text\)/);
});

test("attachment UI exposes preview progress lifecycle retry and remove", () => {
  assert.match(attachments, /URL\.createObjectURL/);
  assert.match(attachments, /Uploading \$\{row\.progress\}%/);
  assert.match(attachments, /row\.status === "uploaded" \? "Uploaded"/);
  assert.match(attachments, /row\.status === "failed"/);
  assert.match(attachments, /store\.retry\(row\.localId\)/);
  assert.match(attachments, /store\.remove\(row\.localId\)/);
  assert.match(attachments, /<progress/);
});

test("send path never silently consumes failed or uploading attachments", () => {
  assert.match(chat, /attachments\.some\(row => row\.status !== "uploaded"\)/);
  assert.match(chat, /composerDraft\.store\.consume\(sentDraft\.text, sentDraft\.attachments\.map\(item => item\.localId\)\)/);
  assert.match(chat, /ATTACHMENT_NOT_FOUND/);
  assert.match(chat, /composerDraft\.store\.unavailable/);
});

test("removed or expired attachment stays recoverable without resurrection", () => {
  assert.match(draft, /this\.controllers\.get\(localId\)\?\.abort\(\)/);
  assert.match(draft, /if \(!this\.state\.attachments\.some\(row => row\.localId === localId\)\) return/);
  assert.match(draft, /Attachment expired or unavailable · retry upload/);
  assert.match(draft, /blob: Blob/);
});

test("attachment lifecycle has mobile-visible styles", () => {
  assert.match(css, /\.ucAttachmentList/);
  assert.match(css, /\.ucAttachmentCard/);
  assert.match(css, /\.ucAttachmentCard\.failed/);
  assert.match(css, /\.ucAttachmentCard\.uploaded/);
  assert.match(css, /@media \(max-width:700px\).*\.ucAttachmentCard/s);
});

test("real-device Mobile Safari and Home Screen proof is intentionally outside this slice", () => {
  assert.doesNotMatch(draft, /MOBILE_SAFARI_VERIFIED|HOME_SCREEN_VERIFIED/);
  assert.doesNotMatch(attachments, /MOBILE_SAFARI_VERIFIED|HOME_SCREEN_VERIFIED/);
});
