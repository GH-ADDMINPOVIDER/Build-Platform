import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/composer-draft.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { ComposerDraftStore } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const file = name => new File(['image bytes'], name, { type: 'image/png' });
const uploaded = row => ({ id: `server_${row.localId}`, filename: row.filename, mime_type: row.mime_type, size_bytes: row.size_bytes });
function persistence(initial) {
  let saved = initial;
  return { load: async () => saved, save: async draft => { saved = structuredClone(draft); } };
}
test('text, Blob preview and uploaded ID survive navigation/reload', async () => {
  const disk = persistence(); const store = new ComposerDraftStore(disk, async row => uploaded(row));
  await store.restore(); store.setText('continue this draft'); await store.add(file('photo.png')); await store.flush();
  const restored = new ComposerDraftStore(disk, async row => uploaded(row)); await restored.restore();
  assert.equal(restored.getSnapshot().text, 'continue this draft');
  assert.equal(restored.getSnapshot().attachments[0].status, 'uploaded');
  assert.equal(await restored.getSnapshot().attachments[0].blob.text(), 'image bytes');
  assert.equal(restored.getSnapshot().attachments[0].uploaded.id, store.getSnapshot().attachments[0].uploaded.id);
});
test('failure retains the file; retry uploads the same local item', async () => {
  let calls = 0; const store = new ComposerDraftStore(persistence(), async row => { if (++calls === 1) throw new Error('offline'); return uploaded(row); });
  await store.restore(); await store.add(file('retry.png')); const id = store.getSnapshot().attachments[0].localId;
  assert.equal(store.getSnapshot().attachments[0].status, 'failed'); assert.equal(store.getSnapshot().attachments[0].error, 'offline');
  await store.retry(id); assert.equal(store.getSnapshot().attachments.length, 1); assert.equal(store.getSnapshot().attachments[0].localId, id); assert.equal(store.getSnapshot().attachments[0].status, 'uploaded');
});
test('fifth attachment is rejected without dropping the first four', async () => {
  const store = new ComposerDraftStore(persistence(), async row => uploaded(row)); await store.restore();
  await Promise.all([1, 2, 3, 4].map(n => store.add(file(`${n}.png`)))); const ids = store.getSnapshot().attachments.map(row => row.localId);
  await assert.rejects(store.add(file('5.png')), /4/); assert.deepEqual(store.getSnapshot().attachments.map(row => row.localId), ids);
});
test('remove during upload cannot resurrect a late response', async () => {
  let finish; const store = new ComposerDraftStore(persistence(), row => new Promise(resolve => { finish = () => resolve(uploaded(row)); }));
  await store.restore(); const pending = store.add(file('remove.png'));
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  store.remove(store.getSnapshot().attachments[0].localId); finish(); await pending; await store.flush();
  assert.equal(store.getSnapshot().attachments.length, 0);
});
test('successful send consumes its snapshot and preserves newly typed text/files', async () => {
  const store = new ComposerDraftStore(persistence(), async row => uploaded(row)); await store.restore();
  store.setText('send this'); await store.add(file('sent.png')); const sentId = store.getSnapshot().attachments[0].localId;
  store.setText('next draft'); await store.add(file('next.png')); store.consume('send this', [sentId]);
  assert.equal(store.getSnapshot().text, 'next draft'); assert.equal(store.getSnapshot().attachments[0].filename, 'next.png'); await store.flush();
});
test('interrupted and expired uploads restore as visible retryable failures', async () => {
  const row = { localId: 'old', filename: 'old.png', mime_type: 'image/png', size_bytes: 11, blob: file('old.png'), status: 'uploaded', progress: 100, uploadedAt: Date.now() - 24 * 60 * 60 * 1000, uploaded: { id: 'expired' } };
  const store = new ComposerDraftStore(persistence({ text: 'keep', attachments: [row, { ...row, localId: 'interrupted', status: 'uploading' }] }), async row => uploaded(row)); await store.restore();
  assert.ok(store.getSnapshot().attachments.every(row => row.status === 'failed' && row.error && !row.uploaded));
  assert.equal(store.getSnapshot().text, 'keep');
});
test('storage failure is visible and the selected file remains in this tab', async () => {
  const store = new ComposerDraftStore({ load: async () => undefined, save: async () => { throw new Error('quota'); } }, async row => uploaded(row));
  await store.restore(); await store.add(file('quota.png')); await store.flush().catch(() => undefined);
  assert.ok(store.getSnapshot().persistenceError); assert.equal(store.getSnapshot().attachments.length, 1);
});
test('server expiry exposes retry without discarding the local Blob', async () => {
 const store=new ComposerDraftStore(persistence(),async row=>uploaded(row));await store.restore();await store.add(file('expired.png'));
 store.unavailable(store.getSnapshot().attachments[0].uploaded.id);
 assert.equal(store.getSnapshot().attachments[0].status,'failed');assert.ok(store.getSnapshot().attachments[0].blob);
 await store.retry(store.getSnapshot().attachments[0].localId);assert.equal(store.getSnapshot().attachments[0].status,'uploaded');
});
