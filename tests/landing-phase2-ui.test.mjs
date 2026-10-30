import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Unifiend landing exposes only working canonical navigation targets", () => {
  const ui = read("src/Landing.tsx");
  for (const href of ["/", "/chat", "/overview", "/app", "#stones"]) {
    assert.match(ui, new RegExp(`href=[\\\"']${href.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}[\\\"']`));
  }
});

test("capability cards keep artwork inside the frame and content outside it", () => {
  const ui = read("src/Landing.tsx");
  assert.match(ui, /<div className="wvModeVisual"><ModeArt kind=\{mode\.kind\} \/><\/div>\s*<div className="wvModeTop">/);
  assert.doesNotMatch(ui, /<div className="wvModeVisual">[^<]*\{mode\.title\}/s);
});

test("Green and Yellow stones are both rendered as floating system visuals", () => {
  const ui = read("src/Landing.tsx");
  const css = read("src/landing.css");
  assert.match(ui, /<StoneArt tone="green" \/>/);
  assert.match(ui, /<StoneArt tone="yellow" \/>/);
  assert.match(css, /@keyframes wvFloat/);
  assert.match(css, /\.stoneFloat \{[^}]*animation:wvFloat/s);
});
