"use strict";

// Hydrium image hosting - a local equivalent of the RecFlare "img" worker.
//
// Mount in index.js:   app.use(require("./images"));
//
// It is plain Express middleware (no extra dependencies). It answers:
//
//   GET/HEAD /<key>          when the request's Host is an image host (img.rec.net, img.*, IMG_HOSTS)
//   GET/HEAD /img/<key>      on any host (handy for testing: http://127.0.0.1:9000/img/<key>)
//   POST     /api/images     simple upload (needs X-Api-Key if IMG_API_KEY is set)
//
// Everything else falls through to the next router.
//
// Key resolution (mirrors the RecFlare docs, with folders instead of R2 buckets):
//   1. static/<key>                      bundled assets always win
//   2. key WITH an extension    -> data/img-store/img/<key>
//      key WITHOUT an extension -> data/img-store/cdn/image/<key>   (storage uploads)
//   3. otherwise static/DefaultProfileImage.jpg (or a built-in gray image), served with 200
//
// Query: ?width= ?height= (64,128,256,512,1024) ?cropSquare=1 (need `sharp`; otherwise ignored)
//        ?sig=p1 adds Content-Signature (placeholder, or real RSA-SHA1 if signing is enabled)
//
// .env settings (all optional):
//   IMG_HOSTS=img.rec.net,img.recflare.net   hosts treated as image hosts (any "img." host also counts)
//   IMG_API_KEY=secret                       required for POST /api/images (empty = open)
//   IMG_PUBLIC_URL=http://127.0.0.1:9000     base used in upload responses
//   IMG_DATA_DIR=./data/img-store            storage root
//   IMG_STATIC_DIR=./static                  bundled assets
//   IMG_MAX_UPLOAD_MB=10
//   IMG_SIGNING_ENABLED=1                    real RSA-SHA1 signatures for ?sig=p1
//   IMG_SIGNING_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 9000);
const PUBLIC_URL = (process.env.IMG_PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, "");
const DATA_DIR = path.resolve(process.env.IMG_DATA_DIR || path.join(__dirname, "data", "img-store"));
const STATIC_DIR = path.resolve(process.env.IMG_STATIC_DIR || path.join(__dirname, "static"));
const MAX_UPLOAD_BYTES = Math.floor(parseFloat(process.env.IMG_MAX_UPLOAD_MB || "10") * 1024 * 1024);
const API_KEY = process.env.IMG_API_KEY || "";
const IMG_HOSTS = (process.env.IMG_HOSTS || "img-hydrium.hydranet.dpdns.org,img.rec.net,img.recflare.net")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
const SIGNING_ENABLED = /^(1|true|yes|on)$/i.test(process.env.IMG_SIGNING_ENABLED || "");
const SIGNING_KEY = (process.env.IMG_SIGNING_KEY || "").replace(/\\n/g, "\n");

const IMG_BUCKET = path.join(DATA_DIR, "img");
const CDN_BUCKET = path.join(DATA_DIR, "cdn", "image");
fs.mkdirSync(IMG_BUCKET, { recursive: true });
fs.mkdirSync(CDN_BUCKET, { recursive: true });

const ALLOWED_DIMS = new Set([64, 128, 256, 512, 1024]);
const CACHE_CONTROL = "public, max-age=31536000, immutable";

// Optional: `npm install sharp` enables resize / cropSquare
let sharp = null;
try {
    sharp = require("sharp");
} catch {
    console.log("[IMAGES] 'sharp' not installed - width/height/cropSquare are ignored (originals served)");
}

// Built-in fallback used when static/DefaultProfileImage.jpg does not exist
const BUILTIN_DEFAULT = Buffer.from("/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAEAAQADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAL/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCyAtIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//Z", "base64");

// ---------- helpers ----------

function sniffMime(buf) {
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

function safeJoin(base, key) {
    const p = path.resolve(base, key);
    return p.startsWith(base + path.sep) ? p : null;
}

function isFile(p) {
    try {
        return fs.statSync(p).isFile();
    } catch {
        return false;
    }
}

function hasExtension(key) {
    return path.extname(key.split("/").pop()) !== "";
}

function readHeader(file) {
    const fd = fs.openSync(file, "r");
    try {
        const b = Buffer.alloc(12);
        const n = fs.readSync(fd, b, 0, 12, 0);
        return b.subarray(0, n);
    } finally {
        fs.closeSync(fd);
    }
}

function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
}

function sendEmpty(res, status, headers = {}) {
    res.writeHead(status, { "Content-Length": 0, ...headers });
    res.end();
}

function isImageHost(req) {
    const host = String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
    return IMG_HOSTS.includes(host) || /^img[.-]/.test(host);
}

// Where a key lives for writing (same rule as reading)
function bucketPathFor(key) {
    return safeJoin(hasExtension(key) ? IMG_BUCKET : CDN_BUCKET, key);
}

function validKey(key) {
    return (
        typeof key === "string" &&
        key.length > 0 &&
        key.length <= 512 &&
        !key.includes("..") &&
        !key.includes("\0") &&
        !key.includes("\\") &&
        !key.startsWith("/")
    );
}

// Store bytes under a key (used by the upload route, and exported for your api code)
function putObject(key, buffer) {
    if (!validKey(key)) throw new Error("invalid image key");
    const dest = bucketPathFor(key);
    if (!dest) throw new Error("invalid image key");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buffer);
    return key;
}

// Store an image under a fresh "<uuid>.<ext>" key and return the key
function saveImage(buffer) {
    const type = sniffMime(buffer);
    if (!type) throw new Error("unsupported image type (png, jpeg, gif, webp only)");
    return putObject(`${crypto.randomUUID()}.${type.ext}`, buffer);
}

// ---------- source resolution ----------

const defaultEtag = '"' + crypto.createHash("sha1").update(BUILTIN_DEFAULT).digest("hex").slice(0, 20) + '"';

function fileSource(file) {
    const st = fs.statSync(file);
    const sniffed = sniffMime(readHeader(file));
    return {
        file,
        size: st.size,
        mime: sniffed ? sniffed.mime : "image/jpeg",
        etag: `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`,
        read: () => fs.readFileSync(file),
        open: (start, end) => fs.createReadStream(file, { start, end }),
    };
}

function resolveSource(key) {
    const staticPath = safeJoin(STATIC_DIR, key);
    if (staticPath && isFile(staticPath)) return { src: fileSource(staticPath), fallback: false };

    const bucketPath = bucketPathFor(key);
    if (bucketPath && isFile(bucketPath)) return { src: fileSource(bucketPath), fallback: false };

    const defaultFile = path.join(STATIC_DIR, "DefaultProfileImage.jpg");
    if (isFile(defaultFile)) return { src: fileSource(defaultFile), fallback: true };

    return {
        src: {
            size: BUILTIN_DEFAULT.length,
            mime: "image/jpeg",
            etag: defaultEtag,
            read: () => BUILTIN_DEFAULT,
            open: (start, end) => {
                const { Readable } = require("stream");
                return Readable.from(BUILTIN_DEFAULT.subarray(start, end + 1));
            },
        },
        fallback: true,
    };
}

// ---------- signature ----------

// RecFlare's placeholder: FNV-1a over the key seeds an xorshift32 PRNG that emits 256 bytes,
// the length of a real RSA-2048 signature, so the client's parser accepts its structure.
function stubSignature(key) {
    let state = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        state = Math.imul(state ^ key.charCodeAt(i), 0x01000193) >>> 0;
    }
    if (state === 0) state = 0x811c9dc5;
    const out = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) {
        state = (state ^ (state << 13)) >>> 0;
        state = state ^ (state >>> 17);
        state = (state ^ (state << 5)) >>> 0;
        out[i] = state & 0xff;
    }
    return out.toString("base64");
}

function contentSignature(key, body) {
    let data;
    if (SIGNING_ENABLED) {
        if (!SIGNING_KEY) return null; // enabled but no key: header omitted entirely
        try {
            data = crypto.sign("RSA-SHA1", body, SIGNING_KEY).toString("base64");
        } catch (err) {
            console.error("[IMAGES] Signing failed:", err.message);
            return null;
        }
    } else {
        data = stubSignature(key); // key-derived placeholder, RSA-2048 length (256 bytes) like RecFlare
    }
    return `key-id=KEY:RSA:p1.rec.net; data=${data}`;
}

// ---------- serving ----------

function pickDim(value) {
    if (value === null || !/^\d+$/.test(value)) return 0;
    const n = parseInt(value, 10);
    return ALLOWED_DIMS.has(n) ? n : 0;
}

async function transform(buf, w, h, crop) {
    const meta = await sharp(buf).metadata();
    let img = sharp(buf);
    let cw = meta.width;
    let ch = meta.height;
    if (crop) {
        const s = Math.min(cw, ch);
        img = img.extract({
            left: Math.floor((cw - s) / 2),
            top: Math.floor((ch - s) / 2),
            width: s,
            height: s,
        });
        cw = s;
        ch = s;
    }
    if (w || h) {
        // when only one dimension is given, the other follows the aspect ratio
        const tw = w || Math.max(1, Math.round((cw * h) / ch));
        const th = h || Math.max(1, Math.round((ch * w) / cw));
        img = img.resize({ width: tw, height: th, fit: "fill" });
    }
    if (meta.format === "png") return { body: await img.png().toBuffer(), mime: "image/png" };
    return { body: await img.flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer(), mime: "image/jpeg" };
}

function parseRange(header, size) {
    // returns null (ignore header), "unsatisfiable", or {start,end}
    if (!header || !/^bytes=/i.test(header)) return null;
    const spec = header.slice(6).split(",")[0].trim();
    const m = /^(\d*)-(\d*)$/.exec(spec);
    if (!m || (m[1] === "" && m[2] === "")) return null;
    if (m[1] === "") {
        const n = parseInt(m[2], 10);
        if (n === 0 || size === 0) return "unsatisfiable";
        return { start: Math.max(0, size - n), end: size - 1 };
    }
    const start = parseInt(m[1], 10);
    const end = m[2] === "" ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
    if (start >= size || start > end) return "unsatisfiable";
    return { start, end };
}

async function serveKey(req, res, key, query) {
    if (!validKey(key)) return sendEmpty(res, 400);

    const { src, fallback } = resolveSource(key);
    if (fallback) console.log(`[IMAGES] Missing key "${key}" - serving default image`);

    const w = pickDim(query.get("width"));
    const h = pickDim(query.get("height"));
    const crop = query.get("cropSquare") === "1";
    const wantSig = query.get("sig") === "p1";
    const isHead = req.method === "HEAD";

    const base = {
        "Cache-Control": CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
    };

    // ----- transformed response: whole body, no ETag, no range, precondition skipped -----
    if (sharp && (w || h || crop)) {
        let out = null;
        try {
            out = await transform(src.read(), w, h, crop);
        } catch (err) {
            console.error(`[IMAGES] Transform failed for "${key}" (${err.message}) - serving original`);
        }
        if (out) {
            const headers = { ...base, "Content-Type": out.mime, "Content-Length": out.body.length };
            if (wantSig) {
                const sig = contentSignature(key, out.body);
                if (sig) headers["Content-Signature"] = sig;
            }
            res.writeHead(200, headers);
            return isHead ? res.end() : res.end(out.body);
        }
    }

    // ----- untouched -----
    const realSigning = wantSig && SIGNING_ENABLED && !!SIGNING_KEY;
    const headers = { ...base, "Content-Type": src.mime, ETag: src.etag };

    if (req.headers["if-none-match"] && req.headers["if-none-match"] === src.etag) {
        return sendEmpty(res, 304, headers);
    }

    // A real signature covers the whole body: serve it all, ignore Range, no Accept-Ranges
    if (realSigning) {
        const body = src.read();
        const sig = contentSignature(key, body);
        if (sig) headers["Content-Signature"] = sig;
        res.writeHead(200, { ...headers, "Content-Length": body.length });
        return isHead ? res.end() : res.end(body);
    }

    if (wantSig) {
        const sig = contentSignature(key, null);
        if (sig) headers["Content-Signature"] = sig;
    }
    headers["Accept-Ranges"] = "bytes";

    const range = parseRange(req.headers.range, src.size);
    if (range === "unsatisfiable") {
        return sendEmpty(res, 416, { ...headers, "Content-Range": `bytes */${src.size}` });
    }
    if (range) {
        res.writeHead(206, {
            ...headers,
            "Content-Range": `bytes ${range.start}-${range.end}/${src.size}`,
            "Content-Length": range.end - range.start + 1,
        });
        if (isHead) return res.end();
        return src.open(range.start, range.end).on("error", () => res.destroy()).pipe(res);
    }

    res.writeHead(200, { ...headers, "Content-Length": src.size });
    if (isHead || src.size === 0) return res.end();
    src.open(0, src.size - 1).on("error", () => res.destroy()).pipe(res);
}

// ---------- upload ----------

function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let failed = false;
        req.on("data", (c) => {
            if (failed) return;
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

async function handleUpload(req, res) {
    if (API_KEY) {
        const given = Buffer.from(String(req.headers["x-api-key"] || ""));
        const want = Buffer.from(API_KEY);
        if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
            return sendJson(res, 401, { error: "invalid or missing API key" });
        }
    }

    let body;
    try {
        body = await readBody(req, MAX_UPLOAD_BYTES + 64 * 1024);
    } catch (e) {
        if (e.code === "TOO_LARGE") {
            res.shouldKeepAlive = false;
            res.on("finish", () => req.destroy());
            return sendJson(res, 413, { error: "image too large" });
        }
        throw e;
    }

    const ct = req.headers["content-type"] || "";
    const data = /^multipart\/form-data/i.test(ct) ? extractMultipartFile(body, ct) : body;
    if (!data || !data.length) return sendJson(res, 400, { error: "no image data in request" });
    if (data.length > MAX_UPLOAD_BYTES) return sendJson(res, 413, { error: "image too large" });

    const type = sniffMime(data);
    if (!type) return sendJson(res, 415, { error: "unsupported image type (png, jpeg, gif, webp only)" });

    const key = saveImage(data);
    console.log(`[IMAGES] Uploaded ${key} (${type.mime}, ${data.length} bytes)`);
    sendJson(res, 201, { key, mime: type.mime, size: data.length, url: `${PUBLIC_URL}/img/${key}` });
}

// ---------- middleware ----------

function middleware(req, res, next) {
    let url;
    try {
        url = new URL(req.originalUrl || req.url, "http://localhost");
    } catch {
        return next();
    }
    const pathname = url.pathname;
    const method = req.method;

    if (method === "POST" && pathname.replace(/\/+$/, "") === "/api/images") {
        return handleUpload(req, res).catch(next);
    }

    if (method !== "GET" && method !== "HEAD") return next();

    // Image metadata: GET /api/images/v6?name=<file>  and  /api/images/v6/<id>
    const meta = /^\/api\/images\/v6(?:\/(\d+))?\/?$/.exec(pathname);
    if (meta) {
        const name = url.searchParams.get("name");
        if (meta[1] === undefined && !name) return sendJson(res, 400, { error: "name is required" });
        const rec = meta[1] !== undefined ? findRecord({ id: meta[1] }) : findRecord({ name });
        console.log(`[IMAGES] metadata ${meta[1] !== undefined ? "id=" + meta[1] : "name=" + name} -> ${rec ? "found" : "404"}`);
        return rec ? sendJson(res, 200, rec) : sendEmpty(res, 404);
    }

    let rawKey = null;
    // ?sig=p1 only ever appears on image requests, so treat those as images on ANY host
    const signedRequest = url.searchParams.get("sig") === "p1" && pathname.length > 1;
    // room data files (/room/<name>) are served by the rooms code, even when this host is also used as the CDN
    const roomData = pathname.startsWith("/room/") && !signedRequest;
    if (!roomData && (isImageHost(req) || signedRequest)) {
        if (pathname === "/") return sendJson(res, 200, { service: "img", status: "ok" });
        rawKey = pathname.slice(1);
    } else if (pathname.startsWith("/img/") && pathname.length > 5) {
        rawKey = pathname.slice(5);
    }
    if (rawKey === null) return next();

    let key;
    try {
        key = decodeURIComponent(rawKey);
    } catch {
        return sendEmpty(res, 400);
    }

    console.log(`[IMAGES] GET ${key}${url.search} (host=${req.headers.host || ""})`);
    // headers are passed to writeHead() directly, so capture them there for the log
    let sent = {};
    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = (status, ...rest) => {
        const h = rest.find((x) => x && typeof x === "object" && !Array.isArray(x)) || {};
        sent = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
        return origWriteHead(status, ...rest);
    };
    res.on("finish", () => {
        const sig = sent["content-signature"];
        console.log(`[IMAGES]   -> ${res.statusCode} ${sent["content-type"] || ""} ${sent["content-length"] || 0} bytes, signature ${sig ? "sent (" + String(sig).length + " chars)" : "NOT sent"}`);
    });
    serveKey(req, res, key, url.searchParams).catch(next);
}

console.log(`[IMAGES] Image hosting enabled - dir=${DATA_DIR}, hosts=${IMG_HOSTS.join(",")} (+ any img.* / img-*)`);

// ---------- photo records (SavedImage metadata behind the photo feeds) ----------
// Stored in <IMG_DATA_DIR>/records.json. Newest first when listed.

const RECORDS_FILE = path.join(DATA_DIR, "records.json");
let records = [];
let nextRecordId = 1;
try {
    const saved = JSON.parse(fs.readFileSync(RECORDS_FILE, "utf8"));
    if (Array.isArray(saved.records)) records = saved.records;
} catch {
    /* first run - no records yet */
}
nextRecordId = records.reduce((m, r) => Math.max(m, Number(r.Id) || 0), 0) + 1;

function persistRecords() {
    const tmp = RECORDS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ records }, null, 2));
    fs.renameSync(tmp, RECORDS_FILE);
}

function intOr(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseIdList(value) {
    let list = [];
    if (Array.isArray(value)) list = value;
    else if (typeof value === "string" && value.trim()) {
        try {
            const j = JSON.parse(value);
            list = Array.isArray(j) ? j : String(value).split(/[,\s;]+/);
        } catch {
            list = value.split(/[,\s;]+/);
        }
    }
    return list.filter((x) => x !== "" && x !== null).map(Number).filter(Number.isSafeInteger);
}

// fields: loose key/value pairs from the upload (form fields / query string); keys are case-insensitive
function addRecord({ imageName, playerId, fields }) {
    const f = {};
    for (const [k, v] of Object.entries(fields || {})) f[k.toLowerCase()] = v;

    const rec = {
        Id: nextRecordId++,
        Type: intOr(f.type, 0),
        Accessibility: intOr(f.accessibility, 1),
        AccessibilityLocked: false,
        ImageName: imageName,
        Description: f.description ? String(f.description).slice(0, 1000) : null,
        PlayerId: intOr(playerId, 0),
        TaggedPlayerIds: parseIdList(f.taggedplayerids),
        RoomId: intOr(f.roomid, null),
        PlayerEventId: intOr(f.playereventid, null),
        CreatedAt: new Date().toISOString(),
        CheerCount: 0,
        CommentCount: 0,
    };
    records.push(rec);
    persistRecords();
    return rec;
}

// Newest first. Optional filters: roomId, playerId. take (1-500, default 100) / skip for paging.
// One photo record by image name or id (for GET /api/images/v6?name= and /v6/:id).
// A file that exists but has no record (uploaded before records were kept) gets a plain one.
function findRecord({ name, id }) {
    if (id !== undefined) return records.find((r) => r.Id === Number(id)) || null;
    const hit = records.find((r) => r.ImageName === name);
    if (hit) return hit;
    if (!validKey(name) || resolveSource(name).fallback) return null;
    return { Id: 0, Type: 0, Accessibility: 1, AccessibilityLocked: false, ImageName: name, Description: null, PlayerId: 0, TaggedPlayerIds: [], RoomId: null, PlayerEventId: null, CreatedAt: new Date(0).toISOString(), CheerCount: 0, CommentCount: 0 };
}

function listRecords({ roomId, playerId, take, skip } = {}) {
    const t = Math.min(Math.max(intOr(take, 100), 1), 500);
    const s = Math.max(intOr(skip, 0), 0);
    return records
        .filter((r) => (roomId === undefined || r.RoomId === roomId) && (playerId === undefined || r.PlayerId === playerId))
        .reverse()
        .slice(s, s + t);
}

// Text (non-file) fields of a multipart/form-data body, as { name: value }
function fieldsFromBody(body, contentType) {
    const out = {};
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
    if (!Buffer.isBuffer(body) || !m || !/^multipart\/form-data/i.test(contentType)) return out;
    const boundary = Buffer.from("--" + (m[1] || m[2]).trim());
    let pos = body.indexOf(boundary);
    while (pos !== -1) {
        const next = body.indexOf(boundary, pos + boundary.length);
        if (next === -1) break;
        const part = body.subarray(pos + boundary.length, next);
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd !== -1) {
            const headers = part.subarray(0, headerEnd).toString("latin1");
            const name = /name="([^"]*)"/i.exec(headers);
            if (name && !/filename=/i.test(headers)) {
                let data = part.subarray(headerEnd + 4);
                if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a)
                    data = data.subarray(0, data.length - 2);
                out[name[1]] = data.toString("utf8").slice(0, 2000);
            }
        }
        pos = next;
    }
    return out;
}

// Pull the image bytes out of an upload body: multipart/form-data (first file part) or raw bytes.
// Returns a Buffer, or null if the body is empty / not a Buffer.
function imageFromBody(body, contentType) {
    if (!Buffer.isBuffer(body) || body.length === 0) return null;
    const data = /^multipart\/form-data/i.test(contentType || "") ? extractMultipartFile(body, contentType) : body;
    return data && data.length ? data : null;
}

module.exports = middleware;
module.exports.putObject = putObject;
module.exports.saveImage = saveImage;
module.exports.imageFromBody = imageFromBody;
module.exports.fieldsFromBody = fieldsFromBody;
module.exports.addRecord = addRecord;
module.exports.listRecords = listRecords;
module.exports.findRecord = findRecord;
