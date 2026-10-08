import fs from "node:fs";
import ts from "typescript";

export async function loadTs(relativePath) {
  const source = fs.readFileSync(new URL("../" + relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));
}
