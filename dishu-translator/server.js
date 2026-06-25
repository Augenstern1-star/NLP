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
    if (req.method === "POST" && requestUrl.pathname === "/api/ai-image-review") {
      await handleAiImageReview(req, res);
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/ai-audience-sim") {
      await handleAiAudienceSim(req, res);
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

async function handleAiImageReview(req, res) {
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

  if (!endpoint || !model || !apiKey || !payload || !Array.isArray(payload.items)) {
    sendJson(res, 400, { error: "endpoint, model, apiKey, and payload.items are required" });
    return;
  }

  const prepared = prepareImageReviewPayload(payload);
  if (!prepared.imageCount) {
    sendJson(res, 400, { error: "No readable images found for the current glyph sequence" });
    return;
  }

  const upstreamBody = {
    model,
    messages: [
      {
        role: "system",
        content: [
          "You are a visual critique assistant for a Book from the Ground translator.",
          "Inspect the attached glyph images and compare visual content with intended Chinese terms.",
          "Return only valid JSON with overall and items fields.",
          "Use Chinese in all explanations.",
        ].join(" "),
      },
      {
        role: "user",
        content: prepared.content,
      },
    ],
    temperature: 0.2,
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
  sendJson(res, 200, { raw, parsed, image_count: prepared.imageCount });
}

async function handleAiAudienceSim(req, res) {
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

  if (!endpoint || !model || !apiKey || !payload || !Array.isArray(payload.visible_sequence)) {
    sendJson(res, 400, { error: "endpoint, model, apiKey, and payload.visible_sequence are required" });
    return;
  }

  const upstreamBody = {
    model,
    messages: [
      {
        role: "system",
        content: [
          "You are an audience simulator for a Book from the Ground artwork.",
          "You do not know the original Chinese sentence.",
          "Infer what a first-time viewer may read from the provided glyph sequence only.",
          "Return only valid JSON. Use Chinese in all text fields.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify(payload, null, 2),
      },
    ],
    temperature: 0.55,
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

function prepareImageReviewPayload(payload) {
  const compactPayload = {
    source: payload.source || "",
    task: payload.task || "AI image review",
    instruction: payload.instruction || "",
    items: (payload.items || []).slice(0, 10).map((item) => ({
      index: item.index,
      type: item.type,
      input_term: item.input_term,
      concept_id: item.concept_id,
      concept_label: item.concept_label,
      category: item.category,
      confidence: item.confidence,
      alignment: item.alignment,
      synonyms: item.synonyms,
      explanation: item.explanation,
      possible_misreadings: item.possible_misreadings,
    })),
    response_format: {
      overall: {
        summary: "整体视觉表达是否清楚",
        visual_score: 0.0,
        main_risks: ["主要视觉误读风险"],
        revision_advice: "整体修改建议",
      },
      items: [
        {
          index: 1,
          input_term: "原输入片段",
          concept_id: "概念 ID 或 null",
          visual_description: "图片看起来像什么",
          intended_meaning: "目标含义",
          fit_score: 0.0,
          misread_risk: "可能误读",
          suggested_fix: "换图/补图/保留建议",
          caption: "展示用图形释义",
        },
      ],
    },
  };

  const content = [
    {
      type: "text",
      text: [
        "请审稿下面的《地书》图形序列。先看图片，再结合 JSON 元数据判断图形是否表达了 input_term。",
        "请指出每个图形的视觉释义、适配度、误读风险和修改建议。",
        "只返回合法 JSON。",
        JSON.stringify(compactPayload, null, 2),
      ].join("\n\n"),
    },
  ];

  let imageCount = 0;
  (payload.items || []).slice(0, 10).forEach((item) => {
    (item.image_paths || []).slice(0, 2).forEach((imagePath) => {
      const dataUrl = imagePathToDataUrl(imagePath);
      if (!dataUrl) return;
      imageCount += 1;
      content.push({
        type: "text",
        text: `item ${item.index} / ${item.input_term || item.concept_label || "unknown"} / ${item.concept_id || "gap"}`,
      });
      content.push({
        type: "image_url",
        image_url: {
          url: dataUrl,
        },
      });
    });
  });

  return { content, imageCount };
}

function imagePathToDataUrl(imagePath) {
  const filePath = resolveClientImagePath(imagePath);
  if (!filePath || !filePath.startsWith(ROOT) || !fs.existsSync(filePath)) return "";
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  const data = fs.readFileSync(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

function resolveClientImagePath(imagePath) {
  const clean = String(imagePath || "").replace(/\\/g, "/").trim();
  if (!clean) return "";
  const candidates = [
    clean,
    clean.replace(/^\.\.\//, "/"),
    clean.startsWith("/") ? clean : `/${clean.replace(/^\.?\//, "")}`,
  ];

  for (const candidate of candidates) {
    const filePath = resolveStaticPath(candidate);
    if (filePath.startsWith(ROOT) && fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return "";
}

function serveStatic(pathname, req, res) {
  const safePathname = pathname === "/" ? "/dishu-translator/index.html" : safeDecode(pathname);
  const filePath = resolveStaticPath(safePathname);
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

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function resolveStaticPath(pathname) {
  const candidates = [
    pathname,
    pathname.replace("/地书标注系统_V1.0/", "/地书标注系统 V1.0/"),
    pathname.replace("/鍦颁功鏍囨敞绯荤粺 V1.0/", "/地书标注系统 V1.0/"),
    pathname.replace("/åœ°ä¹¦æ ‡æ³¨ç³»ç»Ÿ V1.0/", "/地书标注系统 V1.0/"),
  ];

  for (const candidate of candidates) {
    const filePath = path.normalize(path.join(ROOT, candidate));
    if (filePath.startsWith(ROOT) && fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return path.normalize(path.join(ROOT, pathname));
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
