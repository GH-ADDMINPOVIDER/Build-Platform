import { VERSION } from "../server.js";

export default function handler(_req, res) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ name: "ogenic-god-toolkit", version: VERSION, mcp: "/mcp", status: "ok", environment: "preview" }));
}
