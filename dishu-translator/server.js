#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (req.method === "GET" && requestUrl.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, service: "dishu-translator" });
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/ai-gap-fill") {
      await handleAiGapFill(req, res);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    serveStatic(requestUrl.pathname, req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dishu translator running at http://${HOST}:${PORT}/dishu-translator/index.html`);
});

async function handleAiGapFill(req, res) {
  const body = await readBody(req);
  let input;
  try {
    input = JSON.parse(body);
  } catch (error) {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const endpoint = String(input.endpoint || "").trim();
  const model = String(input.model || "").trim();
  const apiKey = String(input.apiKey || "").trim();
  const payload = input.payload;

  if (!endpoint || !model || !apiKey || !payload) {
    sendJson(res, 400, { error: "endpoint, model, apiKey, and payload are required" });
    return;
  }

  const upstreamBody = {
    model,
    messages: [
      {
        role: "system",
        content: [
          "You fill untranslated gaps for a Chinese Book from the Ground translator.",
          "Choose only concept_id values that appear inside each gap's candidates.",
          "Return only valid JSON with a replacements array.",
          "If no candidate is appropriate, use null for concept_id.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify(payload, null, 2),
      },
    ],
    temperature: 0.1,
  };

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (error) {
    sendJson(res, 502, { error: `Could not reach model API: ${error.message}` });
    return;
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    sendJson(res, 502, { error: "Model API returned an error", status: upstream.status, body: text.slice(0, 1200) });
    return;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    sendJson(res, 502, { error: "Model API response was not JSON", body: text.slice(0, 1200) });
    return;
  }

  const raw = extractModelText(data);
  const parsed = parseJsonFromModelText(raw);
  sendJson(res, 200, { raw, parsed });
}

function serveStatic(pathname, req, res) {
  const safePathname = pathname === "/" ? "/dishu-translator/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(ROOT, safePathname));
  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function extractModelText(data) {
  return String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "");
}

function parseJsonFromModelText(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return null;
    }
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}
