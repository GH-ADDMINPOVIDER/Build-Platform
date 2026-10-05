import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("WAVE exposes distinct web chat command agents and operate routes", async () => {
  const main = await read("src/main.tsx");
  assert.match(main, /pathname === "\/command"/);
  assert.match(main, /pathname === "\/agents"/);
  assert.match(main, /<Landing \/>/);
  assert.match(main, /<UnifiedChat surface=\{sourceSurface\} \/>/);
  assert.match(main, /<WaveNext initialTab="run" surface="command" \/>/);
  assert.match(main, /<WaveNext initialTab="agent" surface="agents" \/>/);
  assert.match(main, /<WaveNext initialTab="run" surface="operate" \/>/);
});

test("landing navigation never aliases command or agents back to chat", async () => {
  const landing = await read("src/Landing.tsx");
  assert.match(landing, /href="\/chat">CHAT/);
  assert.match(landing, /href="\/command">COMMAND/);
  assert.match(landing, /href="\/agents">AGENTS/);
  assert.match(landing, /href="\/overview">OPERATE/);
  assert.match(landing, /title: "AGENT DECK"[\s\S]*href: "\/agents"/);
  assert.match(landing, /title: "WAVE COMMAND"[\s\S]*href: "\/command"/);
  assert.doesNotMatch(landing, /title: "AGENT DECK"[\s\S]{0,180}href: "\/chat"/);
});

test("command remains guarded and agents remain separate from execution authority", async () => {
  const wave = await read("src/WaveNext.tsx");
  assert.match(wave, /fetch\("\/api\/wave\/command"/);
  assert.match(wave, /Yellow Stone/);
  assert.match(wave, /href="\/command">Open Command/);
  assert.match(wave, /href="\/agents">AGENTS/);
  assert.match(wave, /href="\/overview">OPERATE/);
  assert.doesNotMatch(wave, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});
