"use strict";

// Zero-dependency image server (Node 18+). Optional: `npm install sharp` enables resizing.

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ---------- tiny .env loader ----------
(function loadEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
})();

const PORT = parseInt(process.env.PORT || "8080", 10);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const MAX_UPLOAD_BYTES = Math.floor(parseFloat(process.env.MAX_UPLOAD_MB || "10") * 1024 * 1024);
const API_KEY = process.env.API_KEY || "";

const IMG_DIR = path.join(DATA_DIR, "images");
const META_DIR = path.join(DATA_DIR, "meta");
fs.mkdirSync(IMG_DIR, { recursive: true });
fs.mkdirSync(META_DIR, { recursive: true });

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  console.warn("[warn] 'sharp' not installed: ?width= / ?height= resizing is disabled.");
}

// ---------- helpers ----------
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

function sniffType(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: "image/png", ext: "png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString("latin1")))
    return { mime: "image/gif", ext: "gif" };
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  return null;
}

const newId = () => crypto.randomBytes(18).toString("base64url");

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function readMeta(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(META_DIR, id + ".json"), "utf8"));
  } catch {
    return null;
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function authorized(req) {
  if (!API_KEY) return true;
  return safeEqual(req.headers["x-api-key"] || "", API_KEY);
}

// Read request body with a hard size cap
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on("data", (c) => {
      if (failed) return; // discard the rest; the 413 is sent by the caller
      size += c.length;
      if (size > limit) {
        failed = true;
        chunks.length = 0;
        reject(Object.assign(new Error("too large"), { code: "TOO_LARGE" }));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Pull the first file part out of a multipart/form-data body
function extractMultipartFile(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) return null;
  const boundary = Buffer.from("--" + (m[1] || m[2]).trim());
  let pos = body.indexOf(boundary);
  while (pos !== -1) {
    const next = body.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    const part = body.subarray(pos + boundary.length, next);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString("latin1");
      if (/filename=/i.test(headers) || /content-type:\s*image\//i.test(headers)) {
        let data = part.subarray(headerEnd + 4);
        if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a)
          data = data.subarray(0, data.length - 2);
        return data;
      }
    }
    pos = next;
  }
  return null;
}

// ---------- handlers ----------
async function handleUpload(req, res) {
  if (!authorized(req)) return sendJson(res, 401, { error: "invalid or missing API key" });

  let body;
  try {
    body = await readBody(req, MAX_UPLOAD_BYTES + 64 * 1024);
  } catch (e) {
    if (e.code === "TOO_LARGE") {
      res.shouldKeepAlive = false;
      res.on("finish", () => req.destroy()); // stop receiving once the 413 is out
      return sendJson(res, 413, { error: "image too large" });
    }
    throw e;
  }

  const ct = req.headers["content-type"] || "";
  const data = /^multipart\/form-data/i.test(ct) ? extractMultipartFile(body, ct) : body;

  if (!data || !data.length) return sendJson(res, 400, { error: "no image data in request" });
  if (data.length > MAX_UPLOAD_BYTES) return sendJson(res, 413, { error: "image too large" });

  const type = sniffType(data);
  if (!type) return sendJson(res, 415, { error: "unsupported image type (png, jpeg, gif, webp only)" });

  const meta = {
    id: newId(),
    mime: type.mime,
    ext: type.ext,
    size: data.length,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
    uploadedAt: new Date().toISOString(),
    uploader: String(req.headers["x-uploader"] || "").slice(0, 64) || null,
  };

  if (sharp) {
    try {
      const info = await sharp(data).metadata();
      meta.width = info.width;
      meta.height = info.height;
    } catch {
      return sendJson(res, 415, { error: "image could not be decoded" });
    }
  }

  fs.writeFileSync(path.join(IMG_DIR, `${meta.id}.${type.ext}`), data);
  fs.writeFileSync(path.join(META_DIR, `${meta.id}.json`), JSON.stringify(meta, null, 2));
  sendJson(res, 201, { ...meta, url: `${PUBLIC_URL}/img/${meta.id}` });
}

async function handleServe(req, res, rawId, query) {
  const id = rawId.replace(/\.(png|jpe?g|gif|webp)$/i, "");
  if (!ID_RE.test(id)) return sendJson(res, 404, { error: "not found" });
  const meta = readMeta(id);
  const file = meta && path.join(IMG_DIR, `${id}.${meta.ext}`);
  if (!meta || !fs.existsSync(file)) return sendJson(res, 404, { error: "not found" });

  const w = Math.min(parseInt(query.get("width"), 10) || 0, 4096);
  const h = Math.min(parseInt(query.get("height"), 10) || 0, 4096);
  const etag = `"${meta.sha256.slice(0, 32)}${w ? "-w" + w : ""}${h ? "-h" + h : ""}"`;

  const headers = {
    "Content-Type": meta.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    ETag: etag,
  };

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }

  if (sharp && (w || h)) {
    const out = await sharp(file, { animated: meta.ext === "gif" || meta.ext === "webp" })
      .resize({ width: w || undefined, height: h || undefined, fit: "inside", withoutEnlargement: true })
      .toBuffer();
    res.writeHead(200, { ...headers, "Content-Length": out.length });
    return res.end(out);
  }

  res.writeHead(200, { ...headers, "Content-Length": meta.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file)
    .on("error", () => res.destroy())
    .pipe(res);
}

function handleDelete(req, res, id) {
  if (!authorized(req)) return sendJson(res, 401, { error: "invalid or missing API key" });
  if (!ID_RE.test(id)) return sendJson(res, 404, { error: "not found" });
  const meta = readMeta(id);
  if (!meta) return sendJson(res, 404, { error: "not found" });
  fs.rmSync(path.join(IMG_DIR, `${id}.${meta.ext}`), { force: true });
  fs.rmSync(path.join(META_DIR, `${id}.json`), { force: true });
  res.writeHead(204);
  res.end();
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    const m = req.method;

    if (m === "GET" && p === "/") return sendJson(res, 200, { name: "hydrium-image-server", status: "ok" });
    if (m === "GET" && p === "/health") return sendJson(res, 200, { ok: true });

    if (m === "POST" && p === "/api/images") return await handleUpload(req, res);

    let r;
    if ((r = /^\/api\/images\/([^/]+)$/.exec(p))) {
      if (m === "GET") {
        const meta = ID_RE.test(r[1]) ? readMeta(r[1]) : null;
        if (!meta) return sendJson(res, 404, { error: "not found" });
        return sendJson(res, 200, { ...meta, url: `${PUBLIC_URL}/img/${meta.id}` });
      }
      if (m === "DELETE") return handleDelete(req, res, r[1]);
    }

    if ((m === "GET" || m === "HEAD") && (r = /^\/img\/([^/]+)$/.exec(p)))
      return await handleServe(req, res, r[1], url.searchParams);

    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
    else res.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Image server listening on port ${PORT}`);
  console.log(`  data dir : ${DATA_DIR}`);
  console.log(`  public   : ${PUBLIC_URL}`);
  console.log(`  auth     : ${API_KEY ? "API key required for upload/delete" : "DISABLED (set API_KEY)"}`);
  console.log(`  resizing : ${sharp ? "enabled" : "disabled (npm install sharp to enable)"}`);
});
