import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("WAVE Phase 2 landing exposes only working canonical navigation targets", () => {
  const ui = read("src/Landing.tsx");
  for (const href of ["/chat", "/overview", "/app", "#green-stone", "#yellow-stone", "#top"]) {
    assert.match(ui, new RegExp(`href=[\\\"']${href.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}[\\\"']`));
  }
});

test("capability cards keep artwork inside the frame and labels below it", () => {
  const ui = read("src/Landing.tsx");
  assert.match(ui, /<div className="olModeVisual"><ModeArt kind=\{mode\.kind\} \/><\/div>\s*<div className="olModeLabel">/);
  assert.doesNotMatch(ui, /<div className="olModeVisual">[^<]*\{mode\.title\}/s);
});

test("Green and Yellow stones are both rendered as floating system visuals", () => {
  const ui = read("src/Landing.tsx");
  const css = read("src/landing.css");
  assert.match(ui, /<StoneArt tone="green" \/>/);
  assert.match(ui, /<StoneArt tone="yellow" \/>/);
  assert.match(css, /@keyframes stoneFloat/);
  assert.match(css, /\.olStoneFrame svg \{[^}]*animation:stoneFloat/s);
});
