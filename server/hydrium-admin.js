// hydrium-admin.js - Hydrium admin panel: CDN videos + admin accounts + command console + live server output + audit log.
//   1. put HYDRIUM_ADMIN_KEY=<a long password> in .env   (the panel stays OFF without it)
//      That key is the OWNER login (leave the username empty, or type "root"). Use it once to create the other admin accounts.
//   2. in index.js, near the other Hydrium lines (before auth/api/static):
//        app.use(require("./hydrium-admin").router);
//   3. restart, open  http://localhost:<port>/admin
// Admin accounts (Admins tab, or the "admins" console command), stored hashed in data/admin-users.json:
//   viewer  can watch the live console, run read-only commands, play videos
//   admin   + upload/delete/rename/convert videos, create accounts, reset player passwords, link accounts
//   owner   + manage admin accounts, player roles, shutdown
// Everything an admin does (logins, commands, uploads...) is written to data/admin-audit.log (passwords are never written).
// Env (all optional):
//   HYDRIUM_ADMIN_KEY      owner password. Required.
//   VIDEOS_DIR             folder served by hydrium-cdn-videos (default static/videos)
//   ADMIN_MAX_MB           max upload size, default 4096
//   ADMIN_HOST=admin-hydrium.hydranet.dpdns.org   serve the panel on this domain (through the tunnel). Other host names get a 404.
//   ADMIN_ALLOW_REMOTE=1   allow tunnel access on ANY host name (use ADMIN_HOST instead, it is stricter).
//                          DEFAULT: local only - requests that arrive through the tunnel get a 404.
//   ADMIN_LOG_LINES        server output lines kept for the live console (default 3000)
//   Large files: Cloudflare refuses requests over ~100 MB, so the page uploads in 50 MB chunks.
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");
const { pipeline } = require("stream/promises");

const router = express.Router();
const KEY = process.env.HYDRIUM_ADMIN_KEY || "";
const DIR = path.resolve(process.env.VIDEOS_DIR || path.join(__dirname, "static", "videos"));
const DATA = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA, "admin-users.json");
const AUDIT_FILE = path.join(DATA, "admin-audit.log");
const LINKS_FILE = path.join(__dirname, "blobs", "platform-links.json");
const MARKS_FILE = path.join(DATA, "password-set.json");
const MAX = (Number(process.env.ADMIN_MAX_MB) || 4096) * 1024 * 1024;
// Files tab: any file type (exe, zip, msi ...) served publicly as a download at /files/<name>
const FILES_DIR = path.resolve(process.env.FILES_DIR || path.join(__dirname, "static", "files"));
const FILES_MAX = (Number(process.env.ADMIN_FILES_MAX_MB) || 20480) * 1024 * 1024;
// Room files tab: the game's room data files (roomdata/room), the ones /room/<name> serves and saves point at
const ROOM_DIR = path.join(path.resolve(process.env.ROOMSAVE_DIR || path.join(__dirname, "roomdata")), "room");
const ROOMF_MAX = (Number(process.env.ADMIN_ROOMFILE_MAX_MB) || 256) * 1024 * 1024;
const FILES_URL = String(process.env.FILES_BASE_URL || "").replace(/\/+$/, "");
const HOST = String(process.env.ADMIN_HOST || "").trim().toLowerCase();
const REMOTE = process.env.ADMIN_ALLOW_REMOTE === "1" || !!HOST;
const EXT = new Set([".mp4", ".m4v", ".webm", ".mov", ".mkv", ".m3u8", ".ts"]);
const SESSION_MS = 12 * 3600 * 1000;
const LOG_LINES = Math.max(200, Number(process.env.ADMIN_LOG_LINES) || 3000);
const RANK = { viewer: 1, admin: 2, owner: 3 };
const STARTED = Date.now();
const module_DIR = DIR;

if (!KEY || KEY.length < 8) {
    console.log("[ADMIN] disabled: set HYDRIUM_ADMIN_KEY (8+ chars) in .env to enable /admin");
    module.exports = { router: express.Router() };
    return;
}
fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });
fs.mkdirSync(ROOM_DIR, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });
const HAS_FFMPEG = !spawnSync("ffmpeg", ["-version"]).error;

// ---------- live server output: copy everything written to stdout/stderr into a ring buffer ----------
const LOGBUF = []; let LOGSEQ = 0; const listeners = new Set();
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const JWT = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g;
function pushLine(kind, text) {
    const o = { id: ++LOGSEQ, t: Date.now(), k: kind, text: text.slice(0, 2000) };
    LOGBUF.push(o); if (LOGBUF.length > LOG_LINES) LOGBUF.shift();
    for (const fn of listeners) { try { fn(o); } catch {} }
}
if (!global.__hydriumAdminHook) {
    global.__hydriumAdminHook = true;
    for (const [stream, kind] of [[process.stdout, "srv"], [process.stderr, "err"]]) {
        const orig = stream.write.bind(stream); let carry = "";
        stream.write = function (chunk, ...rest) {
            try {
                carry += (typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
                const parts = carry.split(/\r?\n/); carry = parts.pop();
                if (carry.length > 8000) { parts.push(carry); carry = ""; }
                for (const p of parts) { const t = p.replace(ANSI, "").replace(JWT, "eyJ…(token hidden)"); if (t.trim()) global.__hydriumAdminPush(kind, t); }
            } catch {}
            return orig(chunk, ...rest);
        };
    }
}
global.__hydriumAdminPush = pushLine; // a reloaded module keeps feeding the newest buffer

// ---------- admin accounts ----------
const NAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;
function loadUsers() { try { const v = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } }
function saveUsers(u) { const t = USERS_FILE + ".tmp"; fs.writeFileSync(t, JSON.stringify(u, null, 2)); fs.renameSync(t, USERS_FILE); }
function hashPw(pw) { const salt = crypto.randomBytes(16); return "s1$" + salt.toString("hex") + "$" + crypto.scryptSync(String(pw), salt, 32).toString("hex"); }
function checkPw(pw, stored) {
    const [v, s, h] = String(stored || "").split("$"); if (v !== "s1" || !s || !h) return false;
    const a = crypto.scryptSync(String(pw), Buffer.from(s, "hex"), 32), b = Buffer.from(h, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const DUMMY = hashPw("dummy-password-for-timing");
function pwProblem(pw) { pw = String(pw || ""); if (pw.length < 10) return "The password must be at least 10 characters."; if (pw.length > 200) return "The password is too long."; return null; }
function userOps(actor) {
    const U = () => loadUsers();
    return {
        list: () => Object.values(U()).map((u) => ({ name: u.name, role: u.role, disabled: !!u.disabled, created: u.created, createdBy: u.createdBy, lastLogin: u.lastLogin || null })),
        add(name, role, pw) {
            name = String(name || "").trim(); role = String(role || "").toLowerCase();
            if (!NAME_RE.test(name) || name.toLowerCase() === "root") throw new Error("Name: 3-24 letters, numbers, . _ - (not 'root').");
            if (!RANK[role]) throw new Error("Role must be viewer, admin or owner.");
            const p = pwProblem(pw); if (p) throw new Error(p);
            const u = U(); if (u[name.toLowerCase()]) throw new Error("That admin already exists.");
            u[name.toLowerCase()] = { name, role, hash: hashPw(pw), ver: 1, created: new Date().toISOString(), createdBy: actor }; saveUsers(u);
        },
        edit(name, patch) {
            const u = U(), k = String(name || "").toLowerCase(), r = u[k]; if (!r) throw new Error("No such admin.");
            if (patch.role !== undefined) { if (!RANK[patch.role]) throw new Error("Role must be viewer, admin or owner."); if (k === String(actor).toLowerCase() && patch.role !== r.role) throw new Error("You can't change your own role."); r.role = patch.role; r.ver++; }
            if (patch.disabled !== undefined) { if (k === String(actor).toLowerCase()) throw new Error("You can't disable yourself."); r.disabled = !!patch.disabled; r.ver++; }
            if (patch.password !== undefined) { const p = pwProblem(patch.password); if (p) throw new Error(p); r.hash = hashPw(patch.password); r.ver++; }
            if (patch.logout) r.ver++;
            saveUsers(u);
        },
        remove(name) { const u = U(), k = String(name || "").toLowerCase(); if (!u[k]) throw new Error("No such admin."); if (k === String(actor).toLowerCase()) throw new Error("You can't delete yourself."); delete u[k]; saveUsers(u); },
        selfPassword(name, old, nw) {
            const u = U(), r = u[String(name).toLowerCase()]; if (!r) throw new Error("The admin key account has no password here: change HYDRIUM_ADMIN_KEY in .env.");
            if (!checkPw(old, r.hash)) throw new Error("The current password is wrong.");
            const p = pwProblem(nw); if (p) throw new Error(p); r.hash = hashPw(nw); r.ver++; saveUsers(u); return r.ver;
        }
    };
}

// ---------- session cookie: base64url(exp|user|ver).hmac ----------
const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (s) => crypto.createHmac("sha256", KEY).update("hydrium-admin2|" + s).digest("hex");
function mkToken(user, ver) { const p = b64([Date.now() + SESSION_MS, user, ver].join("|")); return p + "." + sign(p); }
function readSession(req) {
    const t = (/(?:^|;\s*)hadmin=([^;]+)/.exec(req.headers.cookie || "") || [])[1]; if (!t) return null;
    const [p, mac] = t.split("."); if (!p || !mac) return null;
    const x = Buffer.from(mac), y = Buffer.from(sign(p)); if (x.length !== y.length || !crypto.timingSafeEqual(x, y)) return null;
    const [exp, user, ver] = Buffer.from(p, "base64url").toString().split("|");
    if (!(Number(exp) > Date.now())) return null;
    if (user === "root") return { user: "root", role: "owner", root: true };
    const r = loadUsers()[String(user).toLowerCase()];
    if (!r || r.disabled || String(r.ver) !== String(ver)) return null;
    return { user: r.name, role: r.role, root: false };
}
const sameKey = (x) => { const a = crypto.createHash("sha256").update(String(x)).digest(), b = crypto.createHash("sha256").update(KEY).digest(); return crypto.timingSafeEqual(a, b); };

// ---------- guards ----------
const tunnelled = (req) => !!(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.headers["cf-ray"]);
const ip = (req) => String(req.headers["cf-connecting-ip"] || req.ip || "");
const https = (req) => req.headers["x-forwarded-proto"] === "https" || /https/.test(String(req.headers["cf-visitor"] || "")) || req.secure;
function gate(req, res, next) {
    if (tunnelled(req)) {
        if (!REMOTE) return res.status(404).end();
        if (HOST && String(req.headers.host || "").split(":")[0].toLowerCase() !== HOST) return res.status(404).end();
    }
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex");
    next();
}
const cookieFlags = (req) => `HttpOnly; SameSite=Strict; Path=/admin${https(req) ? "; Secure" : ""}`;
const need = (min) => (req, res, next) => {
    const s = readSession(req);
    if (!s) return res.status(401).json({ error: "login" });
    if (RANK[s.role] < RANK[min]) return res.status(403).json({ error: "your role (" + s.role + ") can't do that" });
    if (req.method !== "GET" && req.headers["x-admin"] !== "1") return res.status(403).json({ error: "csrf" });
    req.admin = s; next();
};
const fails = new Map(); // key -> {n, until}
function limited(...keys) { return keys.some((k) => { const f = fails.get(k); return f && f.until > Date.now() && f.n >= 5; }); }
function fail(...keys) { for (const k of keys) { let f = fails.get(k) || { n: 0, until: 0 }; if (f.until < Date.now()) f = { n: 0, until: 0 }; f.n++; f.until = Date.now() + 10 * 60 * 1000; fails.set(k, f); } }

// ---------- audit log ----------
function audit(who, address, action, detail) {
    try {
        try { if (fs.statSync(AUDIT_FILE).size > 5 * 1024 * 1024) fs.renameSync(AUDIT_FILE, AUDIT_FILE + ".1"); } catch {}
        fs.appendFileSync(AUDIT_FILE, JSON.stringify({ t: new Date().toISOString(), user: who, ip: address, action, detail: String(detail || "").slice(0, 500) }) + "\n");
    } catch (e) { pushLine("err", "[ADMIN] could not write audit log: " + e.message); }
}
const A = (req, action, detail) => audit(req.admin ? req.admin.user : "-", ip(req), action, detail);
function readAudit(n, q) {
    let text = ""; try { text = fs.readFileSync(AUDIT_FILE, "utf8"); } catch { return []; }
    let rows = text.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (q) { q = String(q).toLowerCase(); rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)); }
    return rows.slice(-Math.max(1, Math.min(2000, Number(n) || 200)));
}
router.use("/admin", gate);

// ---------- helpers ----------
function cleanName(raw) {
    let n = path.basename(String(raw || "").replace(/\\/g, "/")).normalize("NFC");
    n = n.replace(/[^\w.\- ()\[\]]+/g, "_").replace(/^\.+/, "").slice(0, 120);
    const ext = path.extname(n).toLowerCase();
    if (!n || !EXT.has(ext)) return null;
    return n;
}
function cleanFile(raw) { // Files tab: any extension, but a plain, harmless name
    let n = path.basename(String(raw || "").replace(/\\/g, "/")).normalize("NFC");
    n = n.replace(/[^\w.\- ()\[\]]+/g, "_").replace(/^\.+/, "").slice(0, 150);
    if (!n || /\.(part|upload|meta)$/i.test(n)) return null;
    return n;
}
function cleanRoomFile(raw) { // a room data file name: it is also a path, so only letters, digits and . _ -
    let n = path.basename(String(raw || "").replace(/\\/g, "/")).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 100);
    if (!/^[A-Za-z0-9]/.test(n) || /\.(part|upload|meta|tmp)$/i.test(n)) return null;
    return n;
}
const spaceOf = (q) => q && q.space === "imports" ? { dir: path.join(DATA, "imports"), max: (Number(process.env.ADMIN_IMPORT_MAX_MB) || 512) * 1024 * 1024, files: true, imports: true }
    : q && q.space === "rooms" ? { dir: ROOM_DIR, max: ROOMF_MAX, files: true, rooms: true }
    : q && q.space === "files" ? { dir: FILES_DIR, max: FILES_MAX, files: true } : { dir: DIR, max: MAX, files: false };
const nameFor = (sp, raw) => sp.rooms ? cleanRoomFile(raw) : sp.files ? cleanFile(raw) : cleanName(raw);

// ---- room files: what is in one, and which rooms use it ----
function pbTop(b) { // [{f,w,v}] of a protobuf message, or null when b is not one
    const out = []; let i = 0;
    const rv = () => { let r = 0, m = 1; for (;;) { if (i >= b.length) throw 0; const c = b[i++]; r += (c & 0x7f) * m; m *= 128; if (c < 0x80) return r; } };
    try {
        while (i < b.length) {
            const k = rv(), f = Math.floor(k / 8), w = k % 8; if (f === 0) return null;
            if (w === 0) out.push({ f, w, v: rv() });
            else if (w === 1) { i += 8; if (i > b.length) return null; out.push({ f, w }); }
            else if (w === 5) { i += 4; if (i > b.length) return null; out.push({ f, w }); }
            else if (w === 2) { const l = rv(); if (i + l > b.length) return null; out.push({ f, w, v: b.subarray(i, i + l) }); i += l; }
            else return null;
        }
    } catch { return null; }
    return out;
}
const INSPECT = new Map();
function inspect(abs, st) {
    const c = INSPECT.get(abs); if (c && c.m === st.mtimeMs && c.s === st.size) return c.r;
    let r = { kind: "unknown" };
    if (st.size > 64 * 1048576) r = { kind: "large" };
    else try {
        let b = fs.readFileSync(abs);
        if (b[0] === 0x1f && b[1] === 0x8b) b = require("zlib").gunzipSync(b);
        const top = pbTop(b);
        if (top && top.some((x) => x.f === 2 && x.w === 2)) {
            let objects = 0, locked = 0;
            for (const x of top) if (x.f === 2 && x.w === 2) { objects++; const o = pbTop(x.v) || []; const fl = o.find((y) => y.f === 14 && y.w === 2); if (fl && (pbTop(fl.v) || []).some((z) => z.f === 4 && z.w === 0 && z.v)) locked++; }
            r = { kind: "room", objects, locked };
        } else if (top && top.length) r = { kind: "protobuf", fields: top.length };
        else { try { JSON.parse(b.toString("utf8")); r = { kind: "json" }; } catch {} }
    } catch {}
    INSPECT.set(abs, { m: st.mtimeMs, s: st.size, r }); return r;
}
function saveDb() { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(ROOM_DIR), "saves.json"), "utf8")); } catch { return { saves: [], rooms: {} }; } }
function usedBy(name) { // [{room, sub, state}]
    const db = saveDb(), out = [], byId = new Map((db.saves || []).map((x) => [x.SubRoomDataSaveId, x]));
    for (const [key, sl] of Object.entries(db.rooms || {})) {
        const [room, sub] = key.split(":");
        for (const [st, id] of [["current", sl.currentSaveId], ["staged", sl.stagedSaveId]]) { const sv = id != null && byId.get(id); if (sv && sv.DataBlob === name) out.push({ room: Number(room), sub: Number(sub), state: st }); }
    }
    return out;
}
function attachRoomFile(name, roomId, subId, who) {
    let rs; try { rs = require("./room-saves"); } catch { throw new Error("room-saves.js not found next to this file"); }
    if (!rs.hasBlob(name)) throw new Error("no such room file: " + name);
    roomId = Number(roomId); if (!Number.isSafeInteger(roomId) || roomId < 1) throw new Error("bad room id");
    let room = null; try { room = require("./hydrium-rooms").allRooms().get(roomId) || null; } catch {}
    if (!room) throw new Error("room " + roomId + " does not exist (see: rooms list)");
    const subs = (room.SubRooms || []).map((x) => x.SubRoomId);
    subId = subId === undefined || subId === "" || subId === null ? subs[0] : Number(subId);
    if (!subs.includes(subId)) throw new Error(`room ${roomId} has no sub-room ${subId} (it has: ${subs.join(", ")})`);
    const sv = rs.createSave({ roomId, subRoomId: subId, dataBlob: name, accountId: null, description: "uploaded in the admin panel by " + who, autoPublish: true });
    rs.publish(roomId, subId, sv.SubRoomDataSaveId);
    return { roomId, subId, name: room.Name };
}
function safe(rel, dir = DIR) { // relative path inside dir (subfolders allowed for existing files)
    const p = path.resolve(dir, String(rel || "").replace(/^[\\/]+/, ""));
    return p.startsWith(dir + path.sep) ? p : null;
}
function listAll(DIR = module_DIR) {
    const out = [];
    (function walk(d, depth) {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { if (depth < 4) walk(full, depth + 1); continue; }
            if (e.name.endsWith(".part") || e.name.endsWith(".upload") || e.name.endsWith(".meta") || e.name.endsWith(".tmp")) continue;
            const st = fs.statSync(full);
            out.push({ name: path.relative(DIR, full).split(path.sep).join("/"), size: st.size, modified: st.mtimeMs });
        }
    })(DIR, 0);
    return out.sort((a, b) => b.modified - a.modified);
}


// ---- zip extraction (Files tab): a .zip uploaded to the CDN is unpacked into a folder next to it ----
function extractZip(zipFile, destRoot) {
    const size = fs.statSync(zipFile).size, base = path.basename(zipFile).replace(/\.zip$/i, "");
    let count = 0, bytes = 0;
    const within = (p) => { const r = path.relative(destRoot, p); return r && !r.startsWith("..") && !path.isAbsolute(r); };
    let z = null;
    if (size <= 1.5 * 1024 ** 3) { try { z = readZip(fs.readFileSync(zipFile)); } catch (e) { z = null; } }
    if (z) {
        const names = z.entries.map((e) => e.name.replace(/\\/g, "/")).filter((n) => n && !/^__macosx\//i.test(n));
        const tops = new Set(names.map((n) => n.split("/")[0]));
        const into = tops.size === 1 && names.some((n) => n.includes("/")) ? destRoot : path.join(destRoot, cleanFile(base) || "extracted"); // a zip with one top folder keeps it
        for (const en of z.entries) {
            const rel = en.name.replace(/\\/g, "/").replace(/^\/+/, "");
            if (!rel || /^__macosx\//i.test(rel) || rel.split("/").some((x) => x === "..")) continue;
            const out = path.join(into, ...rel.split("/").map((x) => cleanFile(x) || "_"));
            if (!within(out)) continue;
            if (rel.endsWith("/")) { fs.mkdirSync(out, { recursive: true }); continue; }
            fs.mkdirSync(path.dirname(out), { recursive: true });
            const d = z.data(en); fs.writeFileSync(out, d); count++; bytes += d.length;
        }
        return { files: count, bytes, folder: path.relative(destRoot, into).split(path.sep).join("/") || "." };
    }
    // very large zips: let the system unpack them (tar on Windows/macOS, unzip on Linux)
    const into = path.join(destRoot, cleanFile(base) || "extracted"); fs.mkdirSync(into, { recursive: true });
    const cp = require("child_process");
    let r = cp.spawnSync("tar", ["-xf", zipFile, "-C", into], { stdio: "ignore" });
    if (r.status !== 0) r = cp.spawnSync("unzip", ["-qq", "-o", zipFile, "-d", into], { stdio: "ignore" });
    if (r.status !== 0) throw new Error("this zip is too large to unpack here and neither tar nor unzip could open it");
    return { files: -1, bytes: size, folder: path.relative(destRoot, into).split(path.sep).join("/") };
}
function autoExtract(req, sp, dest, name) { // after an upload finishes
    if (!sp.files || sp.imports || sp.rooms || !/\.zip$/i.test(name) || req.query.extract === "0") return null;
    try {
        const r = extractZip(dest, sp.dir);
        fs.rmSync(dest, { force: true });
        console.log(`[ADMIN] extracted ${name} -> ${r.folder}/ (${r.files < 0 ? "many" : r.files} files)`); A(req, "extract-zip", `${name} -> ${r.folder}/`);
        return r;
    } catch (e) { console.log(`[ADMIN] could not extract ${name}: ${e.message}`); return { error: e.message }; }
}

// ---- room folders: <Room>/ and <Room>/subrooms/<Sub>/ on disk, the layout the zip import reads ----
const FOLDERS_DIR = path.resolve(process.env.ROOM_FOLDERS_DIR || path.join(DATA, "room-folders"));
const folderName = (n) => String(n || "Room").replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").slice(0, 60) || "Room";
function exportRooms(only) {
    const rs = require("./room-saves"), all = require("./hydrium-rooms").allRooms(), out = [];
    for (const room of all.values()) {
        if (only && Number(only) !== room.RoomId) continue;
        const dir = path.join(FOLDERS_DIR, folderName(room.Name) + (all.size && [...all.values()].filter((x) => folderName(x.Name).toLowerCase() === folderName(room.Name).toLowerCase() && x.RoomId < room.RoomId).length ? "_" + room.RoomId : ""));
        let wrote = 0;
        const subs = room.SubRooms || [];
        subs.forEach((sub, i) => {
            let blob = null; try { blob = rs.currentBlob(room.RoomId, sub.SubRoomId); } catch {}
            if (!blob) { const sc = (room.Scenes || []).find((x) => x.RoomSceneId === sub.SubRoomId) || (room.Scenes || [])[i]; blob = sc && sc.DataBlobName; }
            if (!blob) return;
            const src = safe(blob, ROOM_DIR); if (!src || !fs.existsSync(src)) return;
            const to = i === 0 ? path.join(dir, "home.room") : path.join(dir, "subrooms", folderName(sub.Name), "data.room");
            fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(src, to); wrote++;
        });
        if (!wrote) continue;
        const meta = { Name: room.Name, Description: room.Description || "", MaxPlayers: room.MaxPlayers, CloningAllowed: !!room.CloningAllowed, Tags: (room.Tags || []).filter((t) => t.Type === 0 || t.Type === undefined) };
        fs.writeFileSync(path.join(dir, "room.json"), JSON.stringify(meta, null, 2));
        out.push({ roomId: room.RoomId, name: room.Name, folder: path.relative(FOLDERS_DIR, dir).split(path.sep).join("/"), files: wrote });
    }
    return out;
}
// raw streaming upload: PUT /admin/api/upload/<name>[?overwrite=1][&space=files]  (body = the file)
router.put("/admin/api/upload/:name", need("admin"), async (req, res) => {
    const sp = spaceOf(req.query);
    if (req.socket && req.socket.server && req.socket.server.requestTimeout) req.socket.server.requestTimeout = 0; // Node cuts any request after 5 min by default; big uploads need longer
    const name = nameFor(sp, req.params.name);
    if (!name) return res.status(400).json({ error: sp.files ? "bad file name" : "bad name or type (allowed: " + [...EXT].join(" ") + ")" });
    const dest = path.join(sp.dir, name);
    if (fs.existsSync(dest) && req.query.overwrite !== "1") return res.status(409).json({ error: "exists", name });
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > sp.max) return res.status(413).json({ error: "too big" });
    if (req.query.total !== undefined) return chunk(req, res, name, dest, sp); // chunked upload (?offset=&total=)
    const tmp = dest + "." + crypto.randomBytes(4).toString("hex") + ".part";
    let n = 0;
    try {
        req.on("data", (c) => { n += c.length; if (n > sp.max) req.destroy(new Error("too big")); });
        await pipeline(req, fs.createWriteStream(tmp));
        if (!n) throw new Error("empty upload");
        fs.renameSync(tmp, dest);
        console.log(`[ADMIN] uploaded ${name} (${n} bytes)`); A(req, sp.rooms ? "upload-roomfile" : sp.files ? "upload-file" : "upload", `${name} (${n} bytes)`);
        res.json({ ok: true, name, size: n, extracted: autoExtract(req, sp, dest, name) });
    } catch (e) {
        fs.rm(tmp, { force: true }, () => {});
        console.log(`[ADMIN] upload ${name} failed: ${e.message}`);
        if (!res.headersSent) res.status(e.message === "too big" ? 413 : 500).json({ error: e.message });
    }
});

// where a half-finished chunked upload stands, so the page can carry on after a refresh / dropped connection
router.get("/admin/api/upload-state", need("admin"), (req, res) => {
    const sp = spaceOf(req.query), name = nameFor(sp, req.query.name);
    if (!name) return res.json({ have: 0 });
    const part = path.join(sp.dir, name) + ".upload";
    let have = 0, meta = null;
    try { have = fs.statSync(part).size; meta = JSON.parse(fs.readFileSync(part + ".meta", "utf8")); } catch {}
    res.json({ have: meta && Number(meta.total) === Number(req.query.total) && have < Number(req.query.total) ? have : 0 });
});

// chunked: each PUT carries bytes [offset, offset+len) of a file of `total` bytes; parts append to <name>.upload
async function chunk(req, res, name, dest, sp) {
    const offset = Number(req.query.offset), total = Number(req.query.total);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(total) || offset < 0 || total < 1) return res.status(400).json({ error: "bad chunk" });
    if (total > sp.max) return res.status(413).json({ error: "too big (limit " + Math.round(sp.max / 1048576) + " MB)" });
    const part = dest + ".upload";
    let have = 0; try { have = fs.statSync(part).size; } catch {}
    if (offset === 0) {
        try { fs.unlinkSync(part); } catch {} have = 0;
        try { const st = fs.statfsSync(sp.dir), free = st.bavail * st.bsize; if (free < total * 1.02 + 50 * 1048576) return res.status(507).json({ error: `not enough disk space (${Math.round(free / 1048576)} MB free, need ${Math.round(total / 1048576)} MB)` }); } catch {}
        try { fs.writeFileSync(part + ".meta", JSON.stringify({ total, started: Date.now() })); } catch {}
    }
    if (offset !== have) return res.status(409).json({ error: "out of order", have });
    let n = 0;
    try {
        req.on("data", (c) => { n += c.length; if (offset + n > total) req.destroy(new Error("chunk past end")); });
        await pipeline(req, fs.createWriteStream(part, { flags: "a" }));
        if (!n) throw new Error("empty chunk");
        if (offset + n >= total) { fs.renameSync(part, dest); try { fs.rmSync(part + ".meta", { force: true }); } catch {} console.log(`[ADMIN] uploaded ${name} (${total} bytes, chunked)`); A(req, sp.rooms ? "upload-roomfile" : sp.files ? "upload-file" : "upload", `${name} (${total} bytes)`); return res.json({ ok: true, name, size: total, done: true, extracted: autoExtract(req, sp, dest, name) }); }
        res.json({ ok: true, have: offset + n });
    } catch (e) {
        try { const sz = fs.statSync(part).size; if (sz > offset) fs.truncateSync(part, offset); } catch {}
        console.log(`[ADMIN] chunk ${name}@${offset} failed: ${e.message}`);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
}

router.delete("/admin/api/files", need("admin"), express.json({ limit: "4kb" }), (req, res) => {
    const sp = spaceOf(req.body), p = safe(req.body && req.body.name, sp.dir);
    if (!p || (!sp.files && !EXT.has(path.extname(p).toLowerCase())) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).json({ error: "not found" });
    if (sp.rooms) { const u = usedBy(path.relative(ROOM_DIR, p).split(path.sep).join("/")); if (u.length) return res.status(409).json({ error: "in use by " + u.map((x) => `room ${x.room}/${x.sub} (${x.state})`).join(", ") + " - attach another file to those first" }); }
    fs.unlinkSync(p); console.log(`[ADMIN] deleted ${req.body.name}`); A(req, sp.rooms ? "delete-roomfile" : sp.files ? "delete-file" : "delete-video", req.body.name); res.json({ ok: true });
});

router.post("/admin/api/rename", need("admin"), express.json({ limit: "4kb" }), (req, res) => {
    const sp = spaceOf(req.body), from = safe(req.body && req.body.from, sp.dir), to = nameFor(sp, req.body && req.body.to);
    if (!from || !to || !fs.existsSync(from)) return res.status(400).json({ error: "bad name" });
    const dest = path.join(path.dirname(from), to);
    if (fs.existsSync(dest)) return res.status(409).json({ error: "exists" });
    fs.renameSync(from, dest); console.log(`[ADMIN] renamed ${req.body.from} -> ${to}`); A(req, "rename-video", `${req.body.from} -> ${to}`); res.json({ ok: true });
});

// ffmpeg: re-encode to H.264 + AAC (what the in-game player can play) -> <name>-h264.mp4
const jobs = new Map();
router.post("/admin/api/convert", need("admin"), express.json({ limit: "4kb" }), (req, res) => {
    if (!HAS_FFMPEG) return res.status(501).json({ error: "ffmpeg not found on this PC (install it and add to PATH)" });
    const src = safe(req.body && req.body.name);
    if (!src || !fs.existsSync(src)) return res.status(404).json({ error: "not found" });
    const base = path.basename(src, path.extname(src)).replace(/-h264$/, "");
    const out = path.join(path.dirname(src), base + "-h264.mp4");
    if (jobs.get(out)?.state === "running") return res.status(409).json({ error: "already converting" });
    const id = path.relative(DIR, out).split(path.sep).join("/");
    const job = { name: id, state: "running", started: Date.now(), log: "" };
    jobs.set(out, job);
    const tmp = out + ".part";
    const p = spawn("ffmpeg", ["-y", "-i", src, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-f", "mp4", tmp]);
    p.stderr.on("data", (d) => { job.log = (job.log + d).slice(-400); });
    p.on("close", (code) => {
        if (code === 0) { fs.renameSync(tmp, out); job.state = "done"; } else { fs.rm(tmp, { force: true }, () => {}); job.state = "failed"; }
        console.log(`[ADMIN] convert ${id}: ${job.state}`);
        setTimeout(() => jobs.delete(out), 10 * 60 * 1000);
    });
    console.log(`[ADMIN] converting ${req.body.name} -> ${id}`); A(req, "convert-video", `${req.body.name} -> ${id}`);
    res.json({ ok: true, out: id });
});

// ---------- console commands ----------
// Not a shell: only the commands below exist. Each has a minimum role. Results are plain text.
const KNOWN_ROLES = ["admin", "developer", "moderator", "influencer", "betastudio"];
let _pb; const getPb = () => { if (_pb === undefined) { try { _pb = require("./pb"); } catch (e) { _pb = null; } } if (!_pb) throw new Error("PocketBase module (./pb) not found."); return _pb; };
const acctCol = () => getPb().collection(getPb().hydriumCollections.accounts);
async function findAcct(w) {
    w = String(w || ""); if (!w) throw new Error("Give a username or account id.");
    const pb = getPb();
    try { return /^\d{6,}$/.test(w) ? await acctCol().getFirstListItem(pb.filter("accountId = {:n}", { n: Number(w) })) : await acctCol().getFirstListItem(pb.filter("username = {:u}", { u: w })); }
    catch (e) { if (e.status === 404) throw new Error(`No account '${w}'.`); throw new Error("PocketBase: " + (e.message || e.status)); }
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + ".tmp"; fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, f); };
const marks = () => { const v = readJson(MARKS_FILE, {}); return Array.isArray(v) ? Object.fromEntries(v.map((i) => [String(i), 1])) : v && typeof v === "object" ? v : {}; };
const links = () => { const v = readJson(LINKS_FILE, []); return Array.isArray(v) ? v : []; };
const pad = (s, n) => String(s).padEnd(n);
const ago = (ms) => { const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + "d " : "") + (h ? h + "h " : "") + m + "m"; };
const fmtB = (n) => n > 1e9 ? (n / 1e9).toFixed(2) + " GB" : n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.ceil(n / 1e3) + " KB";
const need2 = (cond, msg) => { if (!cond) throw new Error(msg); };

const COMMANDS = {
    help: { min: "viewer", cat: "General", usage: ["help", "help <command>"], desc: "list every command, or show one command in detail",
        run(c, a) {
            if (a[1]) { const d = COMMANDS[a[1].toLowerCase()]; need2(d, `No command '${a[1]}'.`); return `${a[1].toLowerCase()}  [needs ${d.min}]\n  ${d.desc}\n\nusage:\n${d.usage.map((u) => "  " + u).join("\n")}`; }
            const cats = {}; for (const [n, d] of Object.entries(COMMANDS)) (cats[d.cat] = cats[d.cat] || []).push([n, d]);
            let out = `Hydrium admin console - you are ${c.user} (${c.role}). [role] = lowest role that can run it.\n`;
            for (const [cat, list] of Object.entries(cats)) { out += `\n${cat}\n`; for (const [n, d] of list) out += d.usage.map((u, i) => `  ${pad(u, 38)}${i === 0 ? d.desc + "  [" + d.min + "]" : ""}`).join("\n") + "\n"; }
            return out + "\nTips: use \"quotes\" around values with spaces. Up/Down = command history, Tab = complete a command. 'help <command>' for details.";
        } },
    clear: { min: "viewer", cat: "General", usage: ["clear"], desc: "clear the console window (your screen only)", run: () => ({ clear: true }) },
    whoami: { min: "viewer", cat: "General", usage: ["whoami"], desc: "show your admin name and role", run: (c) => `${c.user}  (${c.role})${c.root ? "  - logged in with the admin key" : ""}` },
    status: { min: "viewer", cat: "General", usage: ["status"], desc: "uptime, memory, counts",
        async run() {
            const m = process.memoryUsage(); let acc = "?"; try { acc = (await acctCol().getList(1, 1)).totalItems; } catch {}
            const v = listAll();
            return [`server up        ${ago(Date.now() - STARTED)}  (pid ${process.pid}, node ${process.version}, ${process.platform})`, `memory           ${fmtB(m.rss)} rss, ${fmtB(m.heapUsed)} heap`,
                `player accounts  ${acc}`, `platform links   ${links().length}`, `videos           ${v.length} files, ${fmtB(v.reduce((s, f) => s + f.size, 0))}  (${DIR})`,
                `admins           ${Object.keys(loadUsers()).length} accounts + admin key`, `live consoles    ${listeners.size} watching, ${LOGBUF.length} lines buffered`, `ffmpeg           ${HAS_FFMPEG ? "found" : "not found"}`].join("\n");
        } },
    config: { min: "viewer", cat: "General", usage: ["config"], desc: "show the (non-secret) settings the server runs with",
        run() {
            const e = process.env, show = (k) => `${pad(k, 24)}${e[k] === undefined ? "(not set)" : e[k]}`, set = (k) => `${pad(k, 24)}${e[k] ? "set" : "(not set)"}`;
            return ["PORT", "ADMIN_HOST", "ADMIN_ALLOW_REMOTE", "ADMIN_MAX_MB", "VIDEOS_DIR", "MAX_ROOMS_PER_ACCOUNT", "DEVEDIT_ROLE", "DEVEDIT_SANDBOX", "DEVEDIT_UNLOCK"].map(show)
                .concat(["HYDRIUM_SMTP_URL", "HYDRIUM_JWT_SECRET", "HYDRIUM_ADMIN_KEY", "POCKETBASE_URL"].map(set)).join("\n");
        } },
    logs: { min: "viewer", cat: "General", usage: ["logs [count] [text]"], desc: "print the last server output lines (default 50), optionally only lines containing text",
        run(c, a) { let n = 50, q = ""; for (const x of a.slice(1)) { if (/^\d+$/.test(x)) n = Math.min(1000, Number(x)); else q = x.toLowerCase(); }
            const rows = LOGBUF.filter((l) => !q || l.text.toLowerCase().includes(q)).slice(-n); return rows.length ? rows.map((l) => `${new Date(l.t).toLocaleTimeString()} ${l.text}`).join("\n") : "(nothing)"; } },
    audit: { min: "viewer", cat: "General", usage: ["audit [count] [text]"], desc: "show the admin audit log (who did what), default 30",
        run(c, a) { let n = 30, q = ""; for (const x of a.slice(1)) { if (/^\d+$/.test(x)) n = Number(x); else q = x; }
            const rows = readAudit(n, q); return rows.length ? rows.map((r) => `${r.t.replace("T", " ").slice(0, 19)}  ${pad(r.user, 12)} ${pad(r.action, 14)} ${r.detail}  (${r.ip})`).join("\n") : "(empty)"; } },

    videos: { min: "viewer", cat: "CDN videos", usage: ["videos list", "videos delete <file>", "videos rename <from> <to>"], desc: "list, delete or rename files in the CDN video folder  [delete/rename: admin]",
        run(c, a) {
            const s = (a[1] || "list").toLowerCase();
            if (s === "list") { const v = listAll(); return v.length ? v.map((f) => `${pad(fmtB(f.size), 10)} ${f.name}`).join("\n") : "No videos yet."; }
            need2(RANK[c.role] >= 2, "Deleting and renaming needs the admin role.");
            if (s === "delete") { const p = safe(a[2]); need2(p && EXT.has(path.extname(p).toLowerCase()) && fs.existsSync(p), "File not found."); fs.unlinkSync(p); return "Deleted " + a[2]; }
            if (s === "rename") { const f = safe(a[2]), t = cleanName(a[3]); need2(f && t && fs.existsSync(f), "Bad name."); const d = path.join(path.dirname(f), t); need2(!fs.existsSync(d), "That name exists."); fs.renameSync(f, d); return `Renamed to ${t}`; }
            throw new Error("usage: videos list | videos delete <file> | videos rename <from> <to>");
        } },

    rooms: { min: "viewer", cat: "Room files", usage: ["rooms list [text]"], desc: "list rooms with their id and sub-room ids (what 'roomfiles attach' needs)",
        run(c, a) {
            let all; try { all = [...require("./hydrium-rooms").allRooms().values()]; } catch { throw new Error("hydrium-rooms.js is not loaded on this server"); }
            const q = a.slice(1).filter((x) => x !== "list").join(" ").toLowerCase();
            const rows = all.filter((r) => !q || String(r.Name).toLowerCase().includes(q) || String(r.RoomId) === q).sort((x, y) => x.RoomId - y.RoomId).slice(0, 200);
            return rows.length ? rows.map((r) => `${pad(String(r.RoomId), 8)} ${pad(String(r.Name).slice(0, 26), 27)} sub-rooms: ${(r.SubRooms || []).map((x) => x.SubRoomId + ":" + x.Name).join(", ")}`).join("\n") : "No rooms match.";
        } },
    roomfolders: { min: "admin", cat: "Room files", usage: ["roomfolders export [roomId]", "roomfolders where"], desc: "write every room (or one) to disk as <Room>/ with subrooms/<Sub>/ folders, the same layout the zip import reads",
        run(c, a) {
            const s = (a[1] || "where").toLowerCase();
            if (s === "where") return FOLDERS_DIR;
            if (s === "export") { const r = exportRooms(a[2]); return r.length ? `Wrote ${r.length} room(s) to ${FOLDERS_DIR}\n` + r.map((x) => `${pad(String(x.roomId), 8)} ${x.folder}  (${x.files} room file${x.files === 1 ? "" : "s"})`).join("\n") : "No rooms with room data files to write."; }
            throw new Error("usage: roomfolders export [roomId] | roomfolders where");
        } },
    roomfiles: { min: "viewer", cat: "Room files", usage: ["roomfiles list", "roomfiles attach <file> <roomId> [subRoomId]", "roomfiles delete <file>"], desc: "game room data files (upload them in the Room files tab). attach = make a room load that file  [attach/delete: admin]",
        run(c, a) {
            const s = (a[1] || "list").toLowerCase();
            if (s === "list") { const v = listAll(ROOM_DIR); return v.length ? v.map((f) => { const i = inspect(path.join(ROOM_DIR, f.name), fs.statSync(path.join(ROOM_DIR, f.name))), u = usedBy(f.name); return `${pad(fmtB(f.size), 10)} ${pad(f.name, 38)} ${i.kind === "room" ? i.objects + " objects" + (i.locked ? ", " + i.locked + " locked" : "") : i.kind}${u.length ? "  used by " + u.map((x) => `${x.room}/${x.sub}${x.state === "staged" ? " (staged)" : ""}`).join(", ") : ""}`; }).join("\n") : "No room files yet."; }
            need2(RANK[c.role] >= 2, "That needs the admin role.");
            if (s === "attach") { need2(a[2] && a[3], "usage: roomfiles attach <file> <roomId> [subRoomId]"); const r = attachRoomFile(a[2], a[3], a[4], c.user); return `Room ${r.roomId}/${r.subId} (${r.name}) now loads ${a[2]}. Enter the room again to see it.`; }
            if (s === "delete") { const p = safe(a[2], ROOM_DIR); need2(p && fs.existsSync(p) && fs.statSync(p).isFile(), "File not found."); const u = usedBy(path.relative(ROOM_DIR, p).split(path.sep).join("/")); need2(!u.length, "In use by " + u.map((x) => `${x.room}/${x.sub}`).join(", ") + " - attach another file there first."); fs.unlinkSync(p); return "Deleted " + a[2]; }
            throw new Error("usage: roomfiles list | roomfiles attach <file> <roomId> [subRoomId] | roomfiles delete <file>");
        } },
    accounts: { min: "viewer", cat: "Player accounts", usage: ["accounts list [text]", "accounts info <user|id>", "accounts create <user> <password>", "accounts setpassword <user|id> <password>", "accounts role <user|id> <roles|user>"],
        desc: "look up players, make accounts, reset a password  [create/setpassword: admin, role: owner]",
        secret: (t) => ((t[1] || "").toLowerCase() === "create" || (t[1] || "").toLowerCase() === "setpassword") ? 3 : -1,
        async run(c, a) {
            const s = (a[1] || "list").toLowerCase(), pb = getPb();
            if (s === "list") {
                const q = a[2], r = await acctCol().getList(1, 100, q ? { filter: pb.filter("username ~ {:q} || displayName ~ {:q}", { q }) } : {}); const mk = marks();
                return r.items.length ? `${r.totalItems} account(s)${r.totalItems > 100 ? " (first 100)" : ""}\n` + r.items.map((x) => `${pad(x.accountId, 11)}${pad(x.username, 22)}${pad(x.displayName || "", 22)}${pad(x.role || "user", 18)}${mk[String(x.accountId)] ? "password set" : ""}`).join("\n") : "No accounts match.";
            }
            if (s === "info") {
                const r = await findAcct(a[2]), L = links().filter((l) => Number(l.accountId) === Number(r.accountId)), mk = marks();
                return [`accountId     ${r.accountId}`, `username      ${r.username}`, `display name  ${r.displayName}`, `roles         ${r.role || "user"}`, `created       ${r.createdAt || "?"}`, `password set  ${mk[String(r.accountId)] ? "yes (" + mk[String(r.accountId)] + ")" : "no"}`,
                    `platform links ${L.length ? L.map((l) => `${l.platform}/${l.platformId}`).join(", ") : "none (not in any account picker)"}`].join("\n");
            }
            if (s === "create") {
                need2(RANK[c.role] >= 2, "Creating accounts needs the admin role.");
                const [u, pw] = [a[2], a[3]]; need2(u && pw, "usage: accounts create <user> <password>");
                need2(/^[A-Za-z0-9_]{3,20}$/.test(u), "Usernames: letters, numbers and _ (3-20 characters)."); need2(pw.length >= 8, "The password must be at least 8 characters.");
                try { await acctCol().getFirstListItem(pb.filter("username = {:u}", { u })); throw new Error(`'${u}' is already taken.`); } catch (e) { if (e.status !== 404) throw e; }
                let id; for (;;) { id = crypto.randomInt(100000000, 999999999); try { await acctCol().getFirstListItem(pb.filter("accountId = {:n}", { n: id })); } catch (e) { if (e.status === 404) break; throw e; } }
                try { await acctCol().create({ accountId: id, username: u, displayName: u, password: pw, passwordConfirm: pw, email: `${u.toLowerCase()}@hydrium.local`, emailVisibility: false, isJunior: false, role: "user", platforms: 0, profileImage: "DefaultProfileImage.jpg", bannerImage: "", displayEmoji: "", personalPronouns: 0, identityFlags: 0, createdAt: new Date().toISOString() }); }
                catch (e) { throw new Error("PocketBase refused: " + ((e.response && e.response.message) || e.message) + " " + JSON.stringify((e.response && e.response.data) || {})); }
                const m = marks(); m[String(id)] = new Date().toISOString(); writeJson(MARKS_FILE, m);
                return `Created account ${id} '${u}'. It shows in the account picker after its first login (or: links add ${u}).`;
            }
            if (s === "setpassword") {
                need2(RANK[c.role] >= 2, "Resetting passwords needs the admin role.");
                const r = await findAcct(a[2]), pw = a[3]; need2(pw && pw.length >= 8, "usage: accounts setpassword <user|id> <password (8+ characters)>");
                try { await acctCol().update(r.id, { password: pw, passwordConfirm: pw }); } catch (e) { throw new Error("PocketBase refused: " + ((e.response && e.response.message) || e.message)); }
                const m = marks(); m[String(r.accountId)] = new Date().toISOString(); writeJson(MARKS_FILE, m);
                return `Password changed for ${r.username} (${r.accountId}).`;
            }
            if (s === "role") {
                need2(c.role === "owner", "Changing player roles needs the owner role.");
                const r = await findAcct(a[2]); const parts = String(a[3] || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
                need2(parts.length, "usage: accounts role <user|id> <admin|developer|moderator|influencer|betastudio|user> (comma separated)");
                let role; if (parts.length === 1 && (parts[0] === "user" || parts[0] === "none")) role = "user"; else { const bad = parts.filter((p) => !KNOWN_ROLES.includes(p)); need2(!bad.length, `Unknown role: ${bad.join(", ")}. Valid: ${KNOWN_ROLES.join(", ")}, user`); role = parts.join(","); }
                try { await acctCol().update(r.id, { role }); } catch (e) { throw new Error("PocketBase refused: " + ((e.response && e.response.message) || e.message)); }
                return `${r.username} now has role '${role}'. They must close and reopen the game to get the new token.`;
            }
            throw new Error("usage: accounts list|info|create|setpassword|role  (try: help accounts)");
        } },

    links: { min: "viewer", cat: "Player accounts", usage: ["links list", "links add <user|id> [platformId]", "links remove <user|id>"], desc: "which accounts appear in the in-game account picker  [add/remove: admin]",
        async run(c, a) {
            const s = (a[1] || "list").toLowerCase(), L = links();
            if (s === "list") { if (!L.length) return "No links yet."; const by = {}; for (const l of L) (by[l.platform + "/" + l.platformId] = by[l.platform + "/" + l.platformId] || []).push(l);
                let out = ""; for (const [k, ls] of Object.entries(by)) { out += `platform id ${k}  (${ls.length} account(s) in its picker)\n`; for (const l of ls) { let n = "?"; try { n = (await findAcct(String(l.accountId))).username; } catch {} out += `   ${pad(l.accountId, 11)}${n}\n`; } } return out.trim(); }
            need2(RANK[c.role] >= 2, "Changing links needs the admin role.");
            const r = await findAcct(a[2]);
            if (s === "add") {
                const ids = a[3] ? [String(a[3])] : [...new Set(L.filter((l) => String(l.platform) === "0").map((l) => String(l.platformId)))]; need2(ids.length, "No platform id known yet - pass it: links add <user> <platformId>");
                let n = 0; for (const pid of ids) if (!L.some((l) => String(l.platformId) === pid && Number(l.accountId) === Number(r.accountId))) { L.push({ platform: 0, platformId: pid, accountId: Number(r.accountId), lastLoginTime: new Date().toISOString(), requirePassword: false }); n++; }
                writeJson(LINKS_FILE, L); return n ? `Linked ${r.username} to ${ids.join(", ")}.` : `${r.username} was already linked.`;
            }
            if (s === "remove") { const k = L.filter((l) => Number(l.accountId) !== Number(r.accountId)); writeJson(LINKS_FILE, k); return `Removed ${L.length - k.length} link(s) of ${r.username}.`; }
            throw new Error("usage: links list | links add <user|id> [platformId] | links remove <user|id>");
        } },

    admins: { min: "viewer", cat: "Admin panel accounts", usage: ["admins list", "admins add <name> <viewer|admin|owner> <password>", "admins role <name> <role>", "admins passwd <name> <password>", "admins disable <name>", "admins enable <name>", "admins logout <name>", "admins remove <name>"],
        desc: "the logins for THIS panel  [everything except list: owner]",
        secret: (t) => ((t[1] || "").toLowerCase() === "add") ? 4 : ((t[1] || "").toLowerCase() === "passwd") ? 3 : -1,
        run(c, a) {
            const s = (a[1] || "list").toLowerCase(), ops = userOps(c.user);
            if (s === "list") { const l = ops.list(); return `root (admin key)   owner\n` + (l.length ? l.map((u) => `${pad(u.name, 19)}${pad(u.role, 8)}${u.disabled ? "DISABLED  " : ""}${u.lastLogin ? "last login " + u.lastLogin.slice(0, 16).replace("T", " ") : "never logged in"}`).join("\n") : "(no other admin accounts yet)"); }
            need2(c.role === "owner", "Managing admin accounts needs the owner role.");
            if (s === "add") { ops.add(a[2], a[3], a[4]); return `Admin '${a[2]}' created as ${a[3]}.`; }
            if (s === "role") { ops.edit(a[2], { role: String(a[3] || "").toLowerCase() }); return `${a[2]} is now ${a[3]} (they were logged out).`; }
            if (s === "passwd") { ops.edit(a[2], { password: a[3] }); return `Password changed for ${a[2]} (they were logged out).`; }
            if (s === "disable") { ops.edit(a[2], { disabled: true }); return `${a[2]} disabled.`; }
            if (s === "enable") { ops.edit(a[2], { disabled: false }); return `${a[2]} enabled.`; }
            if (s === "logout") { ops.edit(a[2], { logout: true }); return `${a[2]} was logged out everywhere.`; }
            if (s === "remove") { ops.remove(a[2]); return `${a[2]} removed.`; }
            throw new Error("try: help admins");
        } },

    shutdown: { min: "owner", cat: "Server", usage: ["shutdown confirm"], desc: "stop the Hydrium server process (it only comes back if something restarts it)",
        run(c, a) { need2(a[1] === "confirm", "This stops the whole server. Run  shutdown confirm  if you mean it."); setTimeout(() => process.exit(0), 700); return "Shutting down in a moment..."; } },
};

function tokenise(line) { const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]); return out; }
async function execLine(line, ctx, address) {
    const a = tokenise(String(line || "").slice(0, 1000)); if (!a.length) return { ok: true, out: "" };
    const name = a[0].toLowerCase(), def = COMMANDS[name];
    if (!def) { audit(ctx.user, address, "cmd-unknown", name); return { ok: false, out: `Unknown command '${name}'. Type help to list the commands.` }; }
    if (name !== "help" && a.length === 2 && /^(help|--help|-h|\?)$/i.test(a[1])) return { ok: true, out: `${name}  [needs ${def.min}]\n  ${def.desc}\n\nusage:\n${def.usage.map((u) => "  " + u).join("\n")}` };
    const sec = def.secret ? def.secret(a) : -1;
    const logged = a.map((t, i) => (sec >= 0 && i >= sec) ? "***" : t).join(" ");
    if (RANK[ctx.role] < RANK[def.min]) { audit(ctx.user, address, "cmd-denied", logged); return { ok: false, out: `'${name}' needs the ${def.min} role (you are ${ctx.role}).` }; }
    try {
        const r = await def.run(ctx, a); audit(ctx.user, address, "cmd", logged);
        if (r && typeof r === "object") return Object.assign({ ok: true, out: "" }, r);
        return { ok: true, out: String(r === undefined ? "" : r) };
    } catch (e) { audit(ctx.user, address, "cmd-failed", logged + "  -> " + e.message); return { ok: false, out: "Error: " + e.message }; }
}

// ---------- routes ----------

router.post("/admin/login", express.json({ limit: "2kb" }), (req, res) => {
    const b = req.body || {}, name = typeof b.user === "string" ? b.user.trim() : "", pw = typeof b.password === "string" ? b.password : typeof b.key === "string" ? b.key : null;
    const lk = "u:" + name.toLowerCase();
    if (limited(ip(req), lk)) return res.status(429).json({ error: "too many tries, wait 10 minutes" });
    let who = null;
    if (pw !== null) {
        if (!name || name.toLowerCase() === "root") { if (sameKey(pw)) who = { user: "root", ver: 0 }; }
        else { const r = loadUsers()[name.toLowerCase()]; const ok = checkPw(pw, r ? r.hash : DUMMY); if (r && ok && !r.disabled) who = { user: r.name, ver: r.ver, rec: r }; }
    }
    if (!who) { fail(ip(req), lk); audit(name || "root", ip(req), "login-failed", ""); console.log(`[ADMIN] failed login (${name || "root"}) from ${ip(req)}`); return res.status(401).json({ error: name ? "wrong name or password" : "wrong key" }); }
    fails.delete(ip(req)); fails.delete(lk);
    if (who.rec) { const u = loadUsers(), r = u[who.user.toLowerCase()]; if (r) { r.lastLogin = new Date().toISOString(); saveUsers(u); } }
    res.setHeader("Set-Cookie", `hadmin=${mkToken(who.user, who.ver)}; ${cookieFlags(req)}; Max-Age=${SESSION_MS / 1000}`);
    audit(who.user, ip(req), "login", ""); console.log(`[ADMIN] ${who.user} logged in from ${ip(req)}`);
    res.json({ ok: true });
});
router.post("/admin/logout", (req, res) => { const s = readSession(req); if (s) audit(s.user, ip(req), "logout", ""); res.setHeader("Set-Cookie", `hadmin=; ${cookieFlags(req)}; Max-Age=0`); res.json({ ok: true }); });

router.get("/admin/api/me", need("viewer"), (req, res) => res.json({ user: req.admin.user, role: req.admin.role, root: req.admin.root }));
router.post("/admin/api/me/password", need("viewer"), express.json({ limit: "2kb" }), (req, res) => {
    if (req.admin.root) return res.status(400).json({ error: "The admin key account has no password here: change HYDRIUM_ADMIN_KEY in .env." });
    try {
        const ver = userOps(req.admin.user).selfPassword(req.admin.user, (req.body || {}).old, (req.body || {}).new);
        res.setHeader("Set-Cookie", `hadmin=${mkToken(req.admin.user, ver)}; ${cookieFlags(req)}; Max-Age=${SESSION_MS / 1000}`); A(req, "password-change", ""); res.json({ ok: true });
    } catch (e) { A(req, "password-change-failed", e.message); res.status(400).json({ error: e.message }); }
});
router.get("/admin/api/users", need("viewer"), (req, res) => res.json({ users: userOps(req.admin.user).list(), root: true, canManage: req.admin.role === "owner" }));
router.post("/admin/api/users", need("owner"), express.json({ limit: "2kb" }), (req, res) => {
    const b = req.body || {}; try { userOps(req.admin.user).add(b.name, String(b.role || "").toLowerCase(), b.password); A(req, "admin-add", `${b.name} (${b.role})`); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch("/admin/api/users/:name", need("owner"), express.json({ limit: "2kb" }), (req, res) => {
    const b = req.body || {}, patch = {}; if (b.role !== undefined) patch.role = String(b.role).toLowerCase(); if (b.disabled !== undefined) patch.disabled = !!b.disabled; if (b.password !== undefined) patch.password = b.password; if (b.logout) patch.logout = true;
    try { userOps(req.admin.user).edit(req.params.name, patch); A(req, "admin-edit", `${req.params.name} ${Object.keys(patch).map((k) => k === "password" ? "password" : k + "=" + patch[k]).join(" ")}`); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete("/admin/api/users/:name", need("owner"), (req, res) => {
    try { userOps(req.admin.user).remove(req.params.name); A(req, "admin-remove", req.params.name); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/admin/api/cmd", need("viewer"), express.json({ limit: "4kb" }), async (req, res) => {
    const r = await execLine((req.body || {}).line, { user: req.admin.user, role: req.admin.role, root: req.admin.root }, ip(req)); res.json(r);
});
router.get("/admin/api/audit", need("viewer"), (req, res) => res.json({ rows: readAudit(req.query.n, req.query.q) }));

// live server output (Server-Sent Events)
router.get("/admin/api/stream", need("viewer"), (req, res) => {
    if (listeners.size >= 8) return res.status(429).json({ error: "too many consoles open" });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (o) => { res.write(`id: ${o.id}\ndata: ${JSON.stringify(o)}\n\n`); if (typeof res.flush === "function") res.flush(); };
    const after = Number(req.query.after || req.headers["last-event-id"] || 0);
    res.write("retry: 2000\n\n");
    for (const o of (after ? LOGBUF.filter((l) => l.id > after) : LOGBUF.slice(-300))) send(o);
    listeners.add(send);
    const hb = setInterval(() => { res.write(": hb\n\n"); if (typeof res.flush === "function") res.flush(); }, 15000);
    req.on("close", () => { clearInterval(hb); listeners.delete(send); });
});

router.get("/admin/api/list", need("viewer"), (req, res) => {
    const sp = spaceOf(req.query);
    res.json({ dir: sp.dir, ffmpeg: HAS_FFMPEG, maxMB: sp.max / 1048576, files: listAll(sp.dir), jobs: sp.files ? [] : [...jobs.values()], base: sp.files ? FILES_URL : "" });
});

// ---------- zip import: a zip with room json + images + room data files, sorted into place ----------
const IMPORT_DIR = path.join(DATA, "imports");
const IMPORT_MAX = (Number(process.env.ADMIN_IMPORT_MAX_MB) || 512) * 1024 * 1024;
fs.mkdirSync(IMPORT_DIR, { recursive: true });
function readZip(buf) { // small zip reader: stored + deflate (no zip64, no passwords)
    let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("that is not a zip file");
    const count = buf.readUInt16LE(e + 10), cd = buf.readUInt32LE(e + 16);
    if (count === 0xffff || cd === 0xffffffff) throw new Error("zip64 archives are not supported - make a normal .zip");
    if (count > 5000) throw new Error("too many files in the zip (limit 5000)");
    const out = []; let p = cd, total = 0;
    for (let i = 0; i < count; i++) {
        if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error("damaged zip");
        const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
        const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
        const name = buf.toString("utf8", p + 46, p + 46 + nl).replace(/\\/g, "/");
        p += 46 + nl + el + cl; total += usize;
        if (total > 1.5 * 1024 ** 3) throw new Error("zip unpacks to more than 1.5 GB");
        out.push({ name, flags, method, csize, usize, lho });
    }
    const data = (en) => {
        if (en.flags & 1) throw new Error(en.name + ": password-protected zips are not supported");
        if (en.lho + 30 > buf.length || buf.readUInt32LE(en.lho) !== 0x04034b50) throw new Error("damaged zip");
        const s = en.lho + 30 + buf.readUInt16LE(en.lho + 26) + buf.readUInt16LE(en.lho + 28), raw = buf.subarray(s, s + en.csize);
        if (en.method === 0) return Buffer.from(raw);
        if (en.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: Math.max(en.usize, 1) + 16 });
        throw new Error(en.name + ": unsupported compression (method " + en.method + ")");
    };
    return { entries: out.filter((x) => !x.name.endsWith("/")), data };
}
const lowerKeys = (o) => { const m = {}; if (o && typeof o === "object") for (const k of Object.keys(o)) m[k.toLowerCase()] = o[k]; return m; };
const gk = (o, k) => lowerKeys(o)[k.toLowerCase()];
function roomsIn(j, depth = 0) { // every room-looking object inside some json
    if (!j || typeof j !== "object" || depth > 4) return [];
    if (Array.isArray(j)) return j.flatMap((x) => roomsIn(x, depth + 1));
    const m = lowerKeys(j);
    if (Array.isArray(m.subrooms)) return [j];
    if (typeof m.name === "string" && (m.roomid !== undefined || m.imagename !== undefined)) return [j];
    for (const k of ["value", "results", "rooms", "data", "room"]) if (m[k] && typeof m[k] === "object") { const r = roomsIn(m[k], depth + 1); if (r.length) return r; }
    return [];
}
function imgType(b) {
    if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
    if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
    if (b.length > 6 && b.toString("latin1", 0, 3) === "GIF") return "gif";
    if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
    return null;
}
const baseOf = (n) => n.split("/").pop();
const stem = (n) => baseOf(n).replace(/\.[^.]+$/, "").toLowerCase();
const stemC = (n) => baseOf(n).replace(/\.[^.]+$/, "");
function zipPlan(buf, zipName) {
    const z = readZip(buf), plan = { rooms: [], images: [], files: [], skipped: [], warnings: [] }, jsons = [], pending = [];
    for (const en of z.entries) {
        const b = baseOf(en.name), low = b.toLowerCase();
        if (/^__macosx\//i.test(en.name) || b.startsWith(".") || low === "thumbs.db" || low === "desktop.ini") continue;
        if (en.usize > 256 * 1048576) { plan.skipped.push({ entry: en.name, reason: "file is larger than 256 MB" }); continue; }
        let data; try { data = z.data(en); } catch (e) { plan.skipped.push({ entry: en.name, reason: e.message }); continue; }
        const ext = path.extname(low);
        if (ext === ".json") { try { { const obj = JSON.parse(data.toString("utf8").replace(/^\ufeff/, "")); jsons.push({ entry: en.name, obj, rooms: roomsIn(obj) }); } } catch { plan.skipped.push({ entry: en.name, reason: "not valid JSON" }); } continue; }
        const it = imgType(data);
        if (it) { plan.images.push({ entry: en.name, size: data.length, type: it, data }); continue; }
        const info = inspectBuf(data);
        if (info.kind === "room" || info.kind === "protobuf" || (!ext && /^[0-9a-f-]{20,}$/i.test(b)) || [".bin", ".dat", ".blob", ".room", ".data"].includes(ext)) plan.files.push({ entry: en.name, size: data.length, ...info, data });
        else plan.skipped.push({ entry: en.name, reason: "not a room file, image or room json" });
    }
    const findFile = (ref) => { if (!ref) return null; const r = baseOf(String(ref)).toLowerCase(), rs = stem(String(ref)); return plan.files.find((f) => baseOf(f.entry).toLowerCase() === r) || plan.files.find((f) => stem(f.entry) === rs) || null; };
    const findImg = (ref) => { if (!ref) return null; const r = baseOf(String(ref)).toLowerCase(), rs = stem(String(ref)); return plan.images.find((f) => baseOf(f.entry).toLowerCase() === r) || plan.images.find((f) => stem(f.entry) === rs) || null; };
    const sceneName = (j, id) => { const sc = (gk(j, "scenes") || []).find((x) => String(gk(x, "RoomSceneId")) === String(id)); return sc || null; };
    const used = new Set(), usedImg = new Set();
    // ---- folder layout: <Room>/ (room name) and <Room>/subrooms/<Sub>/ (sub-rooms) ----
    const segs = (e) => e.replace(/\\/g, "/").split("/").filter(Boolean);
    const everything = [...plan.files.map((f) => ({ t: "file", o: f })), ...plan.images.map((f) => ({ t: "img", o: f })), ...jsons.map((f) => ({ t: "json", o: f }))];
    let strip = 0; // a single wrapper folder around everything (the zip's own name) is not a room
    { const tops = new Set(everything.map((x) => segs(x.o.entry)[0]));
      if (tops.size === 1 && everything.every((x) => segs(x.o.entry).length > 1) && !everything.some((x) => segs(x.o.entry).length === 2 || segs(x.o.entry)[1].toLowerCase() === "subrooms")) strip = 1; }
    const froom = new Map(), inFolder = new Set();
    for (const x of everything) {
        const sg = segs(x.o.entry).slice(strip); if (sg.length < 2) continue;
        let k = sg.findIndex((s2) => s2.toLowerCase() === "subrooms"); if (k === 0) continue;
        const rname = k > 0 ? sg[k - 1] : sg[0], rest = k > 0 ? sg.slice(k + 1) : sg.slice(1);
        if (k > 0 && k - 1 > 0 && !froom.has(rname)) { /* nested deeper than the room folder: still use the folder just above subrooms */ }
        let R = froom.get(rname); if (!R) froom.set(rname, R = { name: rname, own: [], subs: new Map() });
        inFolder.add(x.o.entry);
        if (k > 0) { // inside subrooms/
            if (rest.length >= 2) { let S = R.subs.get(rest[0]); if (!S) R.subs.set(rest[0], S = { name: rest[0], items: [] }); S.items.push(x); }
            else if (rest.length === 1) { const nm = stemC(rest[0]); let S = R.subs.get(nm); if (!S) R.subs.set(nm, S = { name: nm, items: [] }); S.items.push(x); }
        } else R.own.push(x);
    }
    const subName = (n) => String(n).replace(/[^A-Za-z0-9_ ]+/g, "_").replace(/\s+/g, "_").slice(0, 24) || "Sub";
    for (const R of froom.values()) {
        const r = { from: R.name + "/", name: R.name, description: "", tags: [], maxPlayers: undefined, cloningAllowed: false, warningMask: undefined, customWarning: undefined, subs: [], image: null, imageRef: "", loadScreens: [] };
        const own = R.own, ownFiles = own.filter((x) => x.t === "file").map((x) => x.o), ownImgs = own.filter((x) => x.t === "img").map((x) => x.o);
        const rj = own.filter((x) => x.t === "json").map((x) => x.o).sort((a, b) => a.entry.localeCompare(b.entry));
        const meta = rj.length ? (rj[0].rooms[0] || rj[0].obj) : null;
        if (meta) { r.description = String(gk(meta, "Description") || ""); r.tags = (gk(meta, "Tags") || []).filter((t) => typeof (gk(t, "Tag") ?? t) === "string" && (gk(t, "Type") === 0 || gk(t, "Type") === undefined)).map((t) => gk(t, "Tag") ?? t); r.maxPlayers = gk(meta, "MaxPlayers"); r.cloningAllowed = gk(meta, "CloningAllowed") === true; r.warningMask = gk(meta, "WarningMask"); r.customWarning = gk(meta, "CustomWarning"); }
        const isLoad = (f) => /load|screen|splash/i.test(baseOf(f.entry));
        const pic = ownImgs.filter((f) => !isLoad(f)).sort((a, b) => a.entry.localeCompare(b.entry)), ls = ownImgs.filter(isLoad).sort((a, b) => a.entry.localeCompare(b.entry));
        if (pic.length) { r.image = pic[0].entry; usedImg.add(pic[0].entry); } else if (ls.length) { r.image = ls[0].entry; }
        for (const f of ls) { usedImg.add(f.entry); r.loadScreens.push({ image: f.entry, title: "", subtitle: "" }); }
        if (!r.loadScreens.length && pic.length > 1) { for (const f of pic.slice(1)) { usedImg.add(f.entry); r.loadScreens.push({ image: f.entry, title: "", subtitle: "" }); } }
        ownFiles.sort((a, b) => a.entry.localeCompare(b.entry));
        if (ownFiles.length) { used.add(ownFiles[0].entry); r.subs.push({ name: "Home", scene: "", file: ownFiles[0].entry, ref: "" }); for (const f of ownFiles.slice(1)) { used.add(f.entry); r.subs.push({ name: subName(stemC(f.entry)), scene: "", file: f.entry, ref: "" }); } }
        for (const S of [...R.subs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
            const fl = S.items.filter((x) => x.t === "file").map((x) => x.o).sort((a, b) => a.entry.localeCompare(b.entry));
            const sj = S.items.filter((x) => x.t === "json").map((x) => x.o)[0], sm = sj ? (sj.rooms[0] && (gk(sj.rooms[0], "SubRooms") || [])[0]) || sj.obj : null;
            if (fl.length > 1) plan.warnings.push(`${R.name}/subrooms/${S.name}: ${fl.length} data files - used ${baseOf(fl[0].entry)}`);
            if (!fl.length) plan.warnings.push(`${R.name}/subrooms/${S.name}: no room data file - sub-room starts empty`);
            if (fl[0]) used.add(fl[0].entry);
            r.subs.push({ name: subName(S.name), scene: (sm && (gk(sm, "UnitySceneId") || gk(sm, "Scene"))) || "", maxPlayers: sm ? gk(sm, "MaxPlayers") : undefined, file: fl[0] ? fl[0].entry : null, ref: "" });
        }
        if (!r.subs.length) { plan.warnings.push(`${R.name}: no room data file - the room starts empty`); r.subs.push({ name: "Home", scene: "", file: null, ref: "" }); }
        plan.rooms.push(r);
    }
    for (const J of jsons.filter((j) => inFolder.has(j.entry))) J.rooms = [];
    for (const J of jsons) for (const rj of J.rooms) {
        const subsJ = gk(rj, "SubRooms") || [], scenes = gk(rj, "Scenes") || [];
        const r = { from: J.entry, name: String(gk(rj, "Name") || stem(zipName)), description: String(gk(rj, "Description") || ""), tags: (gk(rj, "Tags") || []).filter((t) => t && (gk(t, "Type") === 0 || gk(t, "Type") === undefined) && typeof (gk(t, "Tag") ?? t) === "string").map((t) => gk(t, "Tag") ?? t),
            maxPlayers: gk(rj, "MaxPlayers"), cloningAllowed: gk(rj, "CloningAllowed") === true, warningMask: gk(rj, "WarningMask"), customWarning: gk(rj, "CustomWarning"), subs: [], image: null, imageRef: gk(rj, "ImageName") || "", loadScreens: [] };
        const im = findImg(r.imageRef); if (im) { r.image = im.entry; usedImg.add(im.entry); } else if (r.imageRef) plan.warnings.push(`${r.name}: picture "${r.imageRef}" is not in the zip`);
        for (const ls of (gk(rj, "LoadScreens") || [])) { const li = findImg(gk(ls, "ImageName")); if (li) { usedImg.add(li.entry); r.loadScreens.push({ image: li.entry, title: String(gk(ls, "Title") || ""), subtitle: String(gk(ls, "Subtitle") || "") }); } }
        subsJ.forEach((sj, i) => {
            const cs = gk(sj, "CurrentSave"), sid = gk(sj, "SubRoomId");
            const sc = scenes.find((x) => String(gk(x, "RoomSceneId")) === String(sid)) || scenes[i];
            const ref = gk(sj, "DataBlob") || (cs && gk(cs, "DataBlob")) || (sc && gk(sc, "DataBlobName")) || "";
            const f = findFile(ref); if (f) used.add(f.entry); else if (ref) plan.warnings.push(`${r.name}/${gk(sj, "Name") || "sub-room " + (i + 1)}: data file "${ref}" is not in the zip - that sub-room starts empty`);
            r.subs.push({ name: String(gk(sj, "Name") || (i ? "Sub" + (i + 1) : "Home")), scene: gk(sj, "UnitySceneId") || (sc && gk(sc, "RoomSceneLocationId")) || "", maxPlayers: gk(sj, "MaxPlayers"), file: f ? f.entry : null, ref });
        });
        if (!r.subs.length) r.subs.push({ name: "Home", scene: "", file: null, ref: "" });
        plan.rooms.push(r);
    }
    const loose = plan.files.filter((f) => !used.has(f.entry));
    if (!plan.rooms.length && loose.length) { // no room json: one room, one sub-room per room file
        const r = { from: "", name: stem(zipName), description: "", tags: [], subs: [], image: null, imageRef: "", loadScreens: [] };
        loose.sort((a, b) => a.entry.localeCompare(b.entry)).slice(0, 30).forEach((f, i) => { used.add(f.entry); r.subs.push({ name: loose.length === 1 ? "Home" : i === 0 ? "Home" : stem(f.entry).replace(/[^A-Za-z0-9_ ]+/g, "_").slice(0, 24) || "Sub" + (i + 1), scene: "", file: f.entry, ref: "" }); });
        plan.rooms.push(r);
    }
    const freeImgs = plan.images.filter((x) => !usedImg.has(x.entry));
    for (const r of plan.rooms) if (!r.image && freeImgs.length) { const first = freeImgs.shift(); r.image = first.entry; usedImg.add(first.entry); plan.warnings.push(`${r.name}: used ${baseOf(first.entry)} as the room picture`); }
    plan.unattached = plan.files.filter((f) => !used.has(f.entry)).map((f) => f.entry);
    plan.unusedImages = plan.images.filter((x) => !usedImg.has(x.entry)).map((x) => x.entry);
    if (!plan.rooms.length && !plan.files.length && !plan.images.length) plan.warnings.push("nothing in this zip looks like a room, a room data file or a picture");
    plan._z = z; return plan;
}
function inspectBuf(b) { // like inspect(), for a Buffer
    try {
        if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
        const top = pbTop(b);
        if (top && top.some((x) => x.f === 2 && x.w === 2)) { let objects = 0, locked = 0; for (const x of top) if (x.f === 2 && x.w === 2) { objects++; const o = pbTop(x.v) || []; const fl = o.find((y) => y.f === 14 && y.w === 2); if (fl && (pbTop(fl.v) || []).some((z) => z.f === 4 && z.w === 0 && z.v)) locked++; } return { kind: "room", objects, locked }; }
        if (top && top.length) return { kind: "protobuf" };
    } catch {}
    return { kind: "unknown" };
}
const planView = (p) => ({ rooms: p.rooms.map((r) => ({ name: r.name, from: r.from, image: r.image, loadScreen: r.loadScreens[0] ? r.loadScreens[0].image : null, tags: r.tags, subs: r.subs.map((s) => ({ name: s.name, scene: s.scene, file: s.file })) })),
    files: p.files.map((f) => ({ entry: f.entry, size: f.size, kind: f.kind, objects: f.objects, locked: f.locked })), images: p.images.map((i) => ({ entry: i.entry, size: i.size })),
    skipped: p.skipped, warnings: p.warnings, unattached: p.unattached, unusedImages: p.unusedImages });
const zipPath = (name) => { const n = cleanFile(name); return n ? path.join(IMPORT_DIR, n) : null; };
router.post("/admin/api/import/plan", need("admin"), express.json({ limit: "4kb" }), (req, res) => {
    const zp = zipPath(req.body && req.body.name); if (!zp || !fs.existsSync(zp)) return res.status(404).json({ error: "upload the zip first" });
    try { const p = zipPlan(fs.readFileSync(zp), path.basename(zp)); res.json({ ok: true, plan: planView(p) }); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post("/admin/api/import/run", need("admin"), express.json({ limit: "16kb" }), async (req, res) => {
    const b = req.body || {}, zp = zipPath(b.name);
    if (!zp || !fs.existsSync(zp)) return res.status(404).json({ error: "upload the zip first" });
    try {
        let ur; try { ur = require("./hydrium-userrooms"); } catch { throw new Error("hydrium-userrooms.js is not loaded on this server"); }
        if (typeof ur.importRoom !== "function") throw new Error("hydrium-userrooms.js is the old version - replace it with the new one");
        const owner = await findAcct(b.owner), ownerId = Number(owner.accountId);
        const plan = zipPlan(fs.readFileSync(zp), path.basename(zp));
        if (!plan.rooms.length && !plan.files.length && !plan.images.length) throw new Error("nothing to import in this zip");
        const crypto2 = crypto, stored = new Map(), keys = new Map();
        const putFile = (f) => { // room data file -> roomdata/room (same content = same file)
            if (stored.has(f.entry)) return stored.get(f.entry);
            const hash = crypto2.createHash("sha256").update(f.data).digest("hex");
            let nm = /^[0-9a-f-]{20,}$/i.test(baseOf(f.entry)) ? cleanRoomFile(baseOf(f.entry)) || null : null;
            const same = (n) => { try { return crypto2.createHash("sha256").update(fs.readFileSync(path.join(ROOM_DIR, n))).digest("hex") === hash; } catch { return false; } };
            if (!nm || (fs.existsSync(path.join(ROOM_DIR, nm)) && !same(nm))) nm = crypto2.randomUUID();
            if (!fs.existsSync(path.join(ROOM_DIR, nm))) { const tmp = path.join(ROOM_DIR, nm + ".tmp"); fs.writeFileSync(tmp, f.data); fs.renameSync(tmp, path.join(ROOM_DIR, nm)); }
            stored.set(f.entry, nm); return nm;
        };
        const putImage = (en) => { // picture -> the image store under a content-based key
            if (keys.has(en.entry)) return keys.get(en.entry);
            const key = crypto2.createHash("sha256").update(en.data).digest("hex").slice(0, 32) + "." + en.type;
            require("./images").putObject(key, en.data); keys.set(en.entry, key); return key;
        };
        const imgOf = (entry) => { const i = plan.images.find((x) => x.entry === entry); return i ? putImage(i) : ""; };
        const made = [], one = plan.rooms.length === 1;
        for (const r of plan.rooms) {
            const spec = { name: (one && String(b.roomName || "").trim()) || r.name, description: r.description, tags: r.tags, maxPlayers: r.maxPlayers, cloningAllowed: r.cloningAllowed, accessibility: Number(b.accessibility) || 0,
                warningMask: r.warningMask, customWarning: r.customWarning, scene: b.scene || "", imageName: r.image ? imgOf(r.image) : "",
                loadScreens: r.loadScreens.map((l) => ({ ImageName: imgOf(l.image), Title: l.title, Subtitle: l.subtitle })),
                subs: r.subs.map((s) => ({ name: s.name, scene: s.scene, maxPlayers: s.maxPlayers, blob: s.file ? putFile(plan.files.find((f) => f.entry === s.file)) : "" })) };
            made.push(ur.importRoom(spec, ownerId));
        }
        for (const en of plan.unattached) putFile(plan.files.find((f) => f.entry === en));
        for (const en of plan.unusedImages) imgOf(en);
        if (b.keepZip !== true) fs.rmSync(zp, { force: true });
        console.log(`[ADMIN] imported ${path.basename(zp)}: ${made.length} room(s), ${stored.size} room file(s), ${keys.size} picture(s) for ${owner.username}`);
        A(req, "import-zip", `${path.basename(zp)} -> ${made.map((m) => m.roomId).join(",") || "files only"} (owner ${owner.username})`);
        try { for (const m of made) exportRooms(m.roomId); } catch (e) { console.log("[ADMIN] room folder export: " + e.message); }
        res.json({ ok: true, owner: owner.username, rooms: made, files: [...stored.values()], images: [...keys.values()] });
    } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete("/admin/api/import", need("admin"), express.json({ limit: "4kb" }), (req, res) => { const zp = zipPath(req.body && req.body.name); if (zp) fs.rmSync(zp, { force: true }); res.json({ ok: true }); });

// ---- room files ----
router.post("/admin/api/files/extract", need("admin"), express.json({ limit: "4kb" }), (req, res) => {
    const p = safe(req.body && req.body.name, FILES_DIR);
    if (!p || !/\.zip$/i.test(p) || !fs.existsSync(p)) return res.status(404).json({ error: "zip not found" });
    try { const r = extractZip(p, path.dirname(p)); if (!(req.body && req.body.keep)) fs.rmSync(p, { force: true }); console.log(`[ADMIN] extracted ${req.body.name} -> ${r.folder}/`); A(req, "extract-zip", `${req.body.name} -> ${r.folder}/`); res.json({ ok: true, ...r }); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post("/admin/api/roomfolders/export", need("admin"), express.json({ limit: "4kb" }), (req, res) => {
    try { const r = exportRooms(req.body && req.body.roomId); A(req, "export-room-folders", `${r.length} room(s) -> ${FOLDERS_DIR}`); res.json({ ok: true, dir: FOLDERS_DIR, rooms: r }); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.get("/admin/api/roomfiles", need("viewer"), (req, res) => {
    const files = listAll(ROOM_DIR).map((f) => { const abs = path.join(ROOM_DIR, f.name); let info = { kind: "unknown" }; try { info = inspect(abs, fs.statSync(abs)); } catch {} return { ...f, ...info, used: usedBy(f.name) }; });
    res.json({ dir: ROOM_DIR, maxMB: ROOMF_MAX / 1048576, files });
});
router.get("/admin/api/roomfile", need("viewer"), (req, res) => {
    const p = safe(req.query.name, ROOM_DIR); let ok = false; try { ok = !!p && fs.statSync(p).isFile(); } catch {}
    if (!ok) return res.status(404).end();
    res.download(p, path.basename(p));
});
router.post("/admin/api/roomfiles/attach", need("admin"), express.json({ limit: "4kb" }), (req, res) => {
    try { const b = req.body || {}; const r = attachRoomFile(String(b.name || ""), b.roomId, b.subRoomId, req.admin.user); console.log(`[ADMIN] ${b.name} is now the data of room ${r.roomId}/${r.subId}`); A(req, "attach-roomfile", `${b.name} -> room ${r.roomId}/${r.subId} (${r.name})`); res.json({ ok: true, ...r }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

// public downloads: GET /files/<name>  (no login; resumable, supports Range, always sent as a download)
router.get(/^\/files\/(.+)$/, (req, res, next) => {
    let rel; try { rel = decodeURIComponent(req.params[0]); } catch { return next(); }
    const p = safe(rel, FILES_DIR);
    if (!p || /\.(part|upload|meta)$/i.test(p) || path.basename(p).startsWith(".")) return next();
    let st; try { st = fs.statSync(p); } catch { return next(); }
    if (!st.isFile()) return next();
    res.set({ "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(p))}`, "Content-Type": "application/octet-stream" });
    res.sendFile(p, { acceptRanges: true, lastModified: true, etag: true, cacheControl: false, headers: {} }, (e) => { if (e && !res.headersSent) next(); });
});

router.get("/admin/preview", need("viewer"), (req, res) => {
    const p = safe(req.query.name);
    if (!p || !fs.existsSync(p)) return res.status(404).end();
    res.sendFile(p, { acceptRanges: true });
});

if (HOST) router.get("/", (req, res, next) => (tunnelled(req) && String(req.headers.host || "").split(":")[0].toLowerCase() === HOST) ? res.redirect("/admin") : next());
router.get(["/admin", "/admin/"], (req, res) => { res.set("Cache-Control", "no-store"); res.type("html").send(PAGE); });

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hydrium Admin</title><style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#16181d;--mut:#6b7280;--line:#e3e6ea;--acc:#2563eb;--bad:#dc2626;--ok:#16a34a;--con:#0d1117;--conink:#d6dde6}
@media(prefers-color-scheme:dark){:root{--bg:#101216;--card:#181b21;--ink:#eceef2;--mut:#98a0ad;--line:#272b33;--acc:#5b8def;--bad:#f06565;--ok:#4ade80;--con:#0a0c10}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,Segoe UI,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 64px}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0 0 10px}.sub{color:var(--mut);margin:0 0 16px;font-size:13px;word-break:break-all}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
button,input,select{font:inherit}button{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}
button:hover{border-color:var(--acc)}button.p{background:var(--acc);border-color:var(--acc);color:#fff}button.d{color:var(--bad)}button[disabled]{opacity:.5;cursor:default}
input[type=password],input[type=text],select{background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%}
#drop{border:2px dashed var(--line);border-radius:12px;padding:28px;text-align:center;color:var(--mut);cursor:pointer}#drop.on{border-color:var(--acc);color:var(--acc)}
.row{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.nm{flex:1;min-width:0;word-break:break-all}.mt{color:var(--mut);font-size:12px}.act{display:flex;gap:6px;flex-wrap:wrap}
.bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden;margin-top:6px}.bar i{display:block;height:100%;width:0;background:var(--acc)}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}video{width:100%;max-height:360px;background:#000;border-radius:8px;margin-top:8px}
.msg{font-size:13px;margin:8px 0 0}.err{color:var(--bad)}.okc{color:var(--ok)}.hide{display:none!important}code{background:var(--bg);padding:1px 5px;border-radius:4px}
.tabs{display:flex;gap:6px;margin:0 0 16px;flex-wrap:wrap}.tabs button.on{background:var(--acc);border-color:var(--acc);color:#fff}
#con{background:var(--con);color:var(--conink);font:12.5px/1.45 ui-monospace,Consolas,Menlo,monospace;border-radius:8px;height:56vh;min-height:300px;overflow:auto;padding:10px;white-space:pre-wrap;word-break:break-word}
#con .ln{padding:0}#con .err{color:#ff8a8a}#con .cmd{color:#7db4ff;font-weight:600}#con .res{color:#b9f0c0}#con .rerr{color:#ffb3b3}#con .ts{color:#6b7684}
.tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}.tools input[type=text]{width:200px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#999;margin-right:6px}.dot.on{background:var(--ok)}.dot.off{background:var(--bad)}
#cmdrow{display:flex;gap:8px;margin-top:8px}#cmdrow input{font-family:ui-monospace,Consolas,monospace}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:6px 8px;border-top:1px solid var(--line);vertical-align:top}th{color:var(--mut);font-weight:600;border-top:0}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px}@media(max-width:620px){.grid{grid-template-columns:1fr}.row{flex-direction:column;align-items:stretch}}
</style></head><body><main>
<div id="login" class="card hide" style="max-width:380px;margin:60px auto"><h1>Hydrium Admin</h1><p class="sub">Log in with your admin name and password.<br>Owner: leave the name empty and enter the admin key.</p>
<input id="lu" type="text" placeholder="admin name (empty = admin key)" autocomplete="username" style="margin-bottom:8px"><input id="key" type="password" placeholder="password / admin key" autocomplete="current-password"><div style="margin-top:10px"><button class="p" id="go">Log in</button></div><div id="lerr" class="msg err"></div></div>
<div id="app" class="hide">
<div class="top"><div><h1>Hydrium Admin</h1><p class="sub" id="who"></p></div><button id="out">Log out</button></div>
<div class="tabs"><button data-t="console" class="on">Console</button><button data-t="videos">CDN videos</button><button data-t="files">Files</button><button data-t="roomfiles">Room files</button><button data-t="admins">Admins</button><button data-t="audit">Audit log</button></div>

<section id="t-console" class="card">
 <div class="tools"><span><span class="dot" id="dot"></span><span id="dst" class="mt">connecting</span></span><button id="help" class="p">Help</button>
 <input id="flt" type="text" placeholder="filter output"><label class="mt"><input type="checkbox" id="hold"> pause scrolling</label><button id="cclr">Clear</button><button id="cdl">Download</button></div>
 <div id="con"></div>
 <div id="cmdrow"><input id="cmd" type="text" placeholder="type a command, e.g. help, status, accounts list" autocomplete="off" spellcheck="false"><button class="p" id="run">Run</button></div>
 <p class="mt" style="margin:8px 0 0">Server output streams here live. Every command you run is recorded in the audit log. This is not a shell: only the listed commands exist (press Help).</p>
</section>

<section id="t-videos" class="hide">
<div class="card" id="upcard"><div id="drop">Drop video files here or click to choose<br><span class="mt">mp4 · m4v · webm · mov · mkv · m3u8 · ts</span></div>
<input id="pick" type="file" multiple class="hide"><label class="mt" style="display:block;margin-top:10px"><input type="checkbox" id="ow"> overwrite files with the same name</label><div id="ups"></div></div>
<div class="card"><p class="sub" id="dir"></p><div id="list"></div><div class="msg mt" id="empty"></div>
<p class="mt" style="margin-bottom:0">In the game's player, type <b>only the file name</b> (e.g. <code>bounce.mp4</code>). If a video stays black, press <b>Convert</b>, then use the <code>-h264</code> copy.</p></div>
<div class="card hide" id="pv"><div class="top"><b id="pvn"></b><button id="pvx">Close</button></div><video id="vid" controls></video></div>
</section>

<section id="t-files" class="hide">
<div class="card" id="fupcard"><div id="fdrop">Drop any file here (exe, zip, msi, ...) or click to choose<br><span class="mt">up to ${Math.round(FILES_MAX / 1073741824)} GB per file · big files upload in pieces and carry on after a dropped connection</span></div>
<input id="fpick" type="file" multiple class="hide"><label class="mt" style="display:block;margin-top:10px"><input type="checkbox" id="fow"> overwrite files with the same name</label><div id="fups"></div></div>
<div class="card"><p class="sub" id="fdir"></p><div id="flist"></div><div class="msg mt" id="fempty"></div>
<p class="mt" style="margin-bottom:0">Anyone with the link can download these. Link format: <code>https://&lt;your cdn domain&gt;/files/&lt;name&gt;</code> (Copy link below fills it in).</p></div>
</section>

<section id="t-roomfiles" class="hide">
<div class="card" id="rupcard"><div id="rdrop">Drop room data files here or click to choose<br><span class="mt">the game's room files (the ones in roomdata/room) · up to ${Math.round(ROOMF_MAX / 1048576)} MB each · a file without a game-style name gets a new random one</span></div>
<input id="rpick" type="file" multiple class="hide"><label class="mt" style="display:block;margin-top:10px"><input type="checkbox" id="rfow"> overwrite files with the same name</label><div id="rups"></div></div>
<div class="card" id="impcard"><h2>Import a zip</h2><div id="idrop">Drop a .zip here. Layout: <b>RoomName/</b> is the room, <b>RoomName/subrooms/SubName/</b> are its sub-rooms (room data file inside), pictures in the room folder become the room picture and loading screen<br><span class="mt">optional room.json in a folder sets description, tags, max players · a zip with only room json still works · room data files go to roomdata/room and are attached automatically</span></div>
<input id="ipick" type="file" accept=".zip,application/zip" class="hide"><div id="iups"></div>
<div id="iplan" class="hide" style="margin-top:12px"><div id="isum"></div>
<div class="grid" style="margin-top:10px"><input id="iown" type="text" placeholder="owner: username or account id (who owns the new room)"><input id="inm" type="text" placeholder="room name (optional)"><input id="isc" type="text" placeholder="fallback scene guid (optional)"><select id="iacc"><option value="1">public room (shows in the feed)</option><option value="0">private room</option><option value="2">unlisted</option></select></div>
<div style="margin-top:10px"><button class="p" id="igo">Import</button> <button id="ino">Cancel</button></div></div><div class="msg" id="iout"></div></div>
<div class="card"><p class="sub" id="rdir"></p><div style="margin-bottom:10px"><button id="rexp">Write all rooms to folders</button> <span class="mt" id="rexpm">makes &lt;Room&gt;/ and &lt;Room&gt;/subrooms/&lt;Sub&gt;/ for every existing room</span></div><div id="rlist"></div><div class="msg mt" id="rempty"></div>
<p class="mt" style="margin-bottom:0">A file does nothing until a room uses it: press <b>Use in room</b> and give the room id (type <code>rooms list</code> in the Console to see ids). The room loads it the next time someone enters. Files a room is using can't be deleted.</p></div>
</section>

<section id="t-admins" class="hide">
<div class="card"><h2>Admin accounts</h2><div id="ulist"></div>
<div id="uadd" class="hide" style="margin-top:14px"><h2>Add an admin</h2><div class="grid"><input id="an" type="text" placeholder="name"><select id="ar"><option>viewer</option><option selected>admin</option><option>owner</option></select><input id="ap" type="password" placeholder="password (10+ chars)" autocomplete="new-password"><button class="p" id="aa">Add</button></div>
<p class="mt" style="margin:6px 0 0">viewer = watch console + read-only commands · admin = + videos, player accounts · owner = + manage admins, roles, shutdown</p><div id="amsg" class="msg"></div></div></div>
<div class="card" id="pwcard"><h2>Change my password</h2><div class="grid" style="grid-template-columns:1fr 1fr auto"><input id="po" type="password" placeholder="current password" autocomplete="current-password"><input id="pn" type="password" placeholder="new password (10+)" autocomplete="new-password"><button class="p" id="pg">Change</button></div><div id="pmsg" class="msg"></div></div>
</section>

<section id="t-audit" class="hide card"><div class="tools"><input id="aq" type="text" placeholder="search (name, command, ip...)"><button id="ar2">Refresh</button></div><div style="overflow:auto"><table><thead><tr><th>time</th><th>who</th><th>action</th><th>detail</th><th>ip</th></tr></thead><tbody id="atb"></tbody></table></div></section>
</div>
</main><script>
const $=s=>document.querySelector(s);const H={"X-Admin":"1"},CT={"Content-Type":"application/json"};let ME=null;
const fmt=n=>n>1e9?(n/1e9).toFixed(2)+" GB":n>1e6?(n/1e6).toFixed(1)+" MB":Math.ceil(n/1e3)+" KB";
const rank=r=>({viewer:1,admin:2,owner:3})[r]||0;
async function api(u,o={}){const r=await fetch(u,{credentials:"same-origin",...o,headers:{...H,...(o.headers||{})}});if(r.status===401){show(false);throw new Error("login")}
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j}
function show(on){$("#login").classList.toggle("hide",on);$("#app").classList.toggle("hide",!on);if(!on)disconnect()}
$("#go").onclick=async()=>{try{await api("/admin/login",{method:"POST",headers:CT,body:JSON.stringify({user:$("#lu").value,password:$("#key").value})});$("#key").value="";boot()}catch(e){$("#lerr").textContent=e.message}};
$("#key").onkeydown=$("#lu").onkeydown=e=>{if(e.key==="Enter")$("#go").click()};
$("#out").onclick=async()=>{await api("/admin/logout",{method:"POST"}).catch(()=>{});show(false)};
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>tab(b.dataset.t));
function tab(t){document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("on",b.dataset.t===t));["console","videos","files","roomfiles","admins","audit"].forEach(x=>$("#t-"+x).classList.toggle("hide",x!==t));
 if(t==="videos")load();if(t==="files")loadFiles();if(t==="roomfiles")loadRoomFiles();if(t==="admins")loadUsers();if(t==="audit")loadAudit();if(t==="console")setTimeout(()=>$("#cmd").focus(),50)}
async function boot(){try{ME=await api("/admin/api/me");show(true);$("#who").textContent="Logged in as "+ME.user+" ("+ME.role+")";
 const can=rank(ME.role)>=2;$("#upcard").classList.toggle("hide",!can);$("#fupcard").classList.toggle("hide",!can);$("#rupcard").classList.toggle("hide",!can);$("#impcard").classList.toggle("hide",!can);$("#uadd").classList.toggle("hide",ME.role!=="owner");$("#pwcard").classList.toggle("hide",ME.root);connect();tab("console")}catch(e){if(e.message!=="login")console.error(e)}}

/* ---------- console ---------- */
let es=null,lastId=0,count=0,lines=[];
const con=$("#con");
function stamp(t){const d=new Date(t);return d.toLocaleTimeString([],{hour12:false})}
function addLine(o){const d=document.createElement("div");d.className="ln "+(o.k==="err"?"err":o.k||"");const s=document.createElement("span");s.className="ts";s.textContent=o.t?stamp(o.t)+"  ":"";d.appendChild(s);d.appendChild(document.createTextNode(o.text));
 d._t=(o.text||"").toLowerCase();const f=$("#flt").value.toLowerCase();if(f&&!d._t.includes(f))d.classList.add("hide");con.appendChild(d);lines.push((o.t?stamp(o.t)+"  ":"")+o.text);
 while(con.childNodes.length>3000){con.removeChild(con.firstChild);lines.shift()}if(!$("#hold").checked)con.scrollTop=con.scrollHeight}
function dot(on,t){$("#dot").className="dot "+(on?"on":"off");$("#dst").textContent=t}
function connect(){disconnect();es=new EventSource("/admin/api/stream?after="+lastId);
 es.onopen=()=>dot(true,"live");es.onmessage=e=>{try{const o=JSON.parse(e.data);lastId=Math.max(lastId,o.id);addLine(o)}catch{}};
 es.onerror=()=>{dot(false,"reconnecting");if(es&&es.readyState===2){const me=es;setTimeout(()=>{api("/admin/api/me").then(()=>{if(es===me)connect()}).catch(()=>{})},3000)}}}
function disconnect(){if(es){es.close();es=null}dot(false,"offline")}
$("#flt").oninput=()=>{const f=$("#flt").value.toLowerCase();for(const d of con.childNodes)d.classList.toggle("hide",!!f&&!d._t.includes(f))};
$("#cclr").onclick=()=>{con.textContent="";lines=[]};
$("#cdl").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([lines.join("\\n")],{type:"text/plain"}));a.download="hydrium-console-"+new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")+".txt";a.click()};
const hist=[];let hi=0;const NAMES=["help","clear","whoami","status","config","logs","audit","videos","accounts","links","admins","shutdown"];
async function runCmd(line){line=line.trim();if(!line)return;hist.push(line);hi=hist.length;addLine({k:"cmd",text:"> "+line.replace(/^((?:accounts\\s+(?:create|setpassword)\\s+\\S+|admins\\s+(?:add\\s+\\S+\\s+\\S+|passwd\\s+\\S+))\\s+).*$/i,"$1***")});
 if(/^clear$/i.test(line)){con.textContent="";lines=[];return}
 try{const j=await api("/admin/api/cmd",{method:"POST",headers:CT,body:JSON.stringify({line})});if(j.clear){con.textContent="";lines=[];return}
  String(j.out||"").split("\\n").forEach(t=>addLine({k:j.ok?"res":"rerr",text:t}))}catch(e){if(e.message!=="login")addLine({k:"rerr",text:"Error: "+e.message})}}
$("#run").onclick=()=>{const v=$("#cmd").value;$("#cmd").value="";runCmd(v)};
$("#help").onclick=()=>{runCmd("help");tab("console")};
$("#cmd").onkeydown=e=>{if(e.key==="Enter"){$("#run").click()}else if(e.key==="ArrowUp"){if(hi>0)hi--;$("#cmd").value=hist[hi]||"";e.preventDefault()}else if(e.key==="ArrowDown"){if(hi<hist.length)hi++;$("#cmd").value=hist[hi]||"";e.preventDefault()}
 else if(e.key==="Tab"){const v=$("#cmd").value;if(v&&!/\\s/.test(v)){const m=NAMES.filter(n=>n.startsWith(v.toLowerCase()));if(m.length===1)$("#cmd").value=m[0]+" ";else if(m.length>1)addLine({k:"res",text:m.join("   ")});e.preventDefault()}}};

/* ---------- admins ---------- */
async function loadUsers(){try{const d=await api("/admin/api/users");const L=$("#ulist");L.innerHTML="";const mk=(h)=>{const r=document.createElement("div");r.className="row";r.innerHTML=h;return r};
 const root=mk('<div class="nm"><b>root</b> <span class="mt">admin key · owner</span></div>');L.appendChild(root);
 for(const u of d.users){const r=mk('<div class="nm"><b></b> <span class="mt"></span></div><div class="act"></div>');r.querySelector("b").textContent=u.name;
  r.querySelector(".mt").textContent=u.role+(u.disabled?" · DISABLED":"")+" · "+(u.lastLogin?"last login "+new Date(u.lastLogin).toLocaleString():"never logged in");
  if(d.canManage){const A=r.querySelector(".act");const b=(t,fn,c)=>{const x=document.createElement("button");x.textContent=t;if(c)x.className=c;x.onclick=async()=>{try{await fn();loadUsers()}catch(e){alert(e.message)}};A.appendChild(x)};
   const sel=document.createElement("select");sel.style.width="auto";["viewer","admin","owner"].forEach(o=>{const op=document.createElement("option");op.textContent=o;op.selected=o===u.role;sel.appendChild(op)});sel.onchange=async()=>{try{await api("/admin/api/users/"+encodeURIComponent(u.name),{method:"PATCH",headers:CT,body:JSON.stringify({role:sel.value})});loadUsers()}catch(e){alert(e.message);loadUsers()}};A.appendChild(sel);
   b("Reset password",async()=>{const p=prompt("New password for "+u.name+" (10+ characters)");if(!p)return;await api("/admin/api/users/"+encodeURIComponent(u.name),{method:"PATCH",headers:CT,body:JSON.stringify({password:p})})});
   b(u.disabled?"Enable":"Disable",()=>api("/admin/api/users/"+encodeURIComponent(u.name),{method:"PATCH",headers:CT,body:JSON.stringify({disabled:!u.disabled})}));
   b("Log out",()=>api("/admin/api/users/"+encodeURIComponent(u.name),{method:"PATCH",headers:CT,body:JSON.stringify({logout:true})}));
   b("Delete",async()=>{if(!confirm("Delete admin "+u.name+"?"))return;await api("/admin/api/users/"+encodeURIComponent(u.name),{method:"DELETE"})},"d")}
  L.appendChild(r)}}catch(e){if(e.message!=="login")console.error(e)}}
$("#aa").onclick=async()=>{const m=$("#amsg");try{await api("/admin/api/users",{method:"POST",headers:CT,body:JSON.stringify({name:$("#an").value,role:$("#ar").value,password:$("#ap").value})});$("#an").value=$("#ap").value="";m.className="msg okc";m.textContent="Added.";loadUsers()}catch(e){m.className="msg err";m.textContent=e.message}};
$("#pg").onclick=async()=>{const m=$("#pmsg");try{await api("/admin/api/me/password",{method:"POST",headers:CT,body:JSON.stringify({old:$("#po").value,new:$("#pn").value})});$("#po").value=$("#pn").value="";m.className="msg okc";m.textContent="Password changed (other sessions were logged out)."}catch(e){m.className="msg err";m.textContent=e.message}};

/* ---------- audit ---------- */
async function loadAudit(){try{const d=await api("/admin/api/audit?n=300&q="+encodeURIComponent($("#aq").value));const T=$("#atb");T.innerHTML="";for(const r of d.rows.slice().reverse()){const tr=document.createElement("tr");[r.t.replace("T"," ").slice(0,19),r.user,r.action,r.detail,r.ip].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td)});T.appendChild(tr)}}catch(e){if(e.message!=="login")console.error(e)}}
$("#ar2").onclick=loadAudit;$("#aq").onkeydown=e=>{if(e.key==="Enter")loadAudit()};

/* ---------- videos ---------- */
let timer;async function load(){try{const d=await api("/admin/api/list");const can=ME&&rank(ME.role)>=2;$("#dir").textContent=d.dir+"  ·  max "+d.maxMB+" MB per file";
 const L=$("#list");L.innerHTML="";$("#empty").textContent=d.files.length?"":"No videos yet.";
 for(const f of d.files){const r=document.createElement("div");r.className="row";const job=d.jobs.find(j=>j.name.replace("-h264.mp4","")===f.name.replace(/\\.[^.]+$/,""));
  r.innerHTML='<div class="nm"><b></b><div class="mt"></div></div><div class="act"></div>';r.querySelector("b").textContent=f.name;
  r.querySelector(".mt").textContent=fmt(f.size)+" · "+new Date(f.modified).toLocaleString()+(job?" · convert: "+job.state:"");
  const A=r.querySelector(".act");const b=(t,fn,c)=>{const x=document.createElement("button");x.textContent=t;if(c)x.className=c;x.onclick=fn;A.appendChild(x)};
  b("Play",()=>{$("#pv").classList.remove("hide");$("#pvn").textContent=f.name;$("#vid").src="/admin/preview?name="+encodeURIComponent(f.name);$("#vid").play().catch(()=>{});scrollTo(0,document.body.scrollHeight)});
  b("Copy name",()=>navigator.clipboard.writeText(f.name.split("/").pop()));
  if(can){if(d.ffmpeg)b("Convert",async()=>{try{await api("/admin/api/convert",{method:"POST",headers:CT,body:JSON.stringify({name:f.name})});load()}catch(e){alert(e.message)}});
  b("Rename",async()=>{const n=prompt("New name",f.name.split("/").pop());if(!n)return;try{await api("/admin/api/rename",{method:"POST",headers:CT,body:JSON.stringify({from:f.name,to:n})});load()}catch(e){alert(e.message)}});
  b("Delete",async()=>{if(!confirm("Delete "+f.name+"?"))return;await api("/admin/api/files",{method:"DELETE",headers:CT,body:JSON.stringify({name:f.name})});load()},"d")}
  L.appendChild(r)}
 clearTimeout(timer);if(d.jobs.some(j=>j.state==="running"))timer=setTimeout(load,3000)}catch(e){if(e.message!=="login")console.error(e)}}
$("#pvx").onclick=()=>{$("#vid").pause();$("#vid").removeAttribute("src");$("#pv").classList.add("hide")};
const drop=$("#drop");drop.onclick=()=>$("#pick").click();
["dragenter","dragover"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add("on")}));
["dragleave","drop"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove("on")}));
drop.addEventListener("drop",e=>send([...e.dataTransfer.files]));$("#pick").onchange=e=>{send([...e.target.files]);e.target.value=""};
const SPN=sp=>sp==="rooms"?"rooms":sp==="imports"?"imports":"files";
const OW=sp=>sp==="imports"?{checked:true}:$(sp==="rooms"?"#rfow":sp?"#fow":"#ow"),UPS=sp=>$(sp==="rooms"?"#rups":sp==="imports"?"#iups":sp?"#fups":"#ups");
function roomNamed(f){if(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(f.name))return f;let n;try{n=crypto.randomUUID()}catch{n=[...Array(32)].map(()=>"0123456789abcdef"[Math.random()*16|0]).join("")}return new File([f],n)}
async function send(files,sp){for(const f of files)await up(sp==="rooms"?roomNamed(f):f,sp);sp==="rooms"?loadRoomFiles():sp?loadFiles():load()}
function put(f,from,to,box,sp){return new Promise((ok,bad)=>{const x=new XMLHttpRequest();
 x.open("PUT","/admin/api/upload/"+encodeURIComponent(f.name)+"?total="+f.size+"&offset="+from+(OW(sp).checked?"&overwrite=1":"")+(sp?"&space="+SPN(sp):""));x.setRequestHeader("X-Admin","1");
 x.upload.onprogress=e=>{if(e.lengthComputable)box.set(from+e.loaded)};
 x.onload=()=>{let j={};try{j=JSON.parse(x.responseText)}catch{}if(x.status===401)show(false);x.status===200?ok(j):bad(Object.assign(new Error(x.status===409&&j.error==="exists"?"A file with this name exists (tick overwrite)":(j.error||"failed "+x.status)),{status:x.status,j}))};
 x.onerror=()=>bad(new Error("network error"));x.ontimeout=()=>bad(new Error("timed out"));x.send(f.slice(from,to))})}
async function up(f,sp){const CH=(sp?25:50)*1024*1024;const el=document.createElement("div");el.style.marginTop="10px";el.innerHTML='<div></div><div class="bar"><i></i></div><div class="msg"></div>';
 el.firstChild.textContent=f.name+" ("+fmt(f.size)+")";UPS(sp).prepend(el);const bar=el.querySelector("i"),m=el.querySelector(".msg");
 const t0=Date.now();let base=0;const box={set(v){const p=Math.min(100,v/f.size*100);bar.style.width=p+"%";const sec=(Date.now()-t0)/1000,sp2=sec>2?(v-base)/sec:0;m.textContent=Math.floor(p*10)/10+"%"+(sp2?"  ·  "+fmt(sp2)+"/s":"")}};
 try{if(f.size===0)throw new Error("empty file");let off=0,j;
  if(sp||f.size>CH){try{const st=await api("/admin/api/upload-state?name="+encodeURIComponent(f.name)+"&total="+f.size+(sp?"&space="+SPN(sp):""));if(st.have>0&&st.have<f.size){off=st.have;base=off;m.textContent="Resuming at "+fmt(off)+" ..."}}catch(e){if(e.message==="login")throw e}}
  while(off<f.size){const end=Math.min(off+CH,f.size);let t=0;for(;;){try{j=await put(f,off,end,box,sp);break}catch(e){if(e.status===409&&e.j&&typeof e.j.have==="number"&&e.j.error==="out of order"){off=e.j.have;t=0;if(off>=f.size)break;const e2=Math.min(off+CH,f.size);j=await put(f,off,e2,box,sp);break}
   if(++t>(sp?8:3)||/exists|too big|login|empty|disk space/.test(e.message))throw e;m.textContent="Retrying ("+t+") "+e.message+" ...";await new Promise(r=>setTimeout(r,Math.min(15000,1500*t)))}}off=Math.min(off+CH,f.size)}
  bar.style.width="100%";m.className="msg okc";m.textContent="Uploaded as "+(j&&j.name||f.name)+(j&&j.extracted?(j.extracted.error?"  ·  could not extract: "+j.extracted.error:"  ·  extracted to "+j.extracted.folder+"/ ("+(j.extracted.files<0?"many":j.extracted.files)+" files), zip removed"):"");return (j&&j.name)||f.name}catch(e){m.className="msg err";m.textContent=e.message+(sp&&e.message!=="login"?"  (pick the same file again to resume)":"");return null}}
const fdrop=$("#fdrop");fdrop.onclick=()=>$("#fpick").click();
["dragenter","dragover"].forEach(t=>fdrop.addEventListener(t,e=>{e.preventDefault();fdrop.classList.add("on")}));
["dragleave","drop"].forEach(t=>fdrop.addEventListener(t,e=>{e.preventDefault();fdrop.classList.remove("on")}));
fdrop.addEventListener("drop",e=>send([...e.dataTransfer.files],1));$("#fpick").onchange=e=>{send([...e.target.files],1);e.target.value=""};
async function loadFiles(){try{const d=await api("/admin/api/list?space=files");const can=ME&&rank(ME.role)>=2;$("#fdir").textContent=d.dir+"  ·  max "+Math.round(d.maxMB)+" MB per file";
 const L=$("#flist");L.innerHTML="";$("#fempty").textContent=d.files.length?"":"No files yet.";const base=(d.base||location.origin).replace(/\\/+$/,"");
 for(const f of d.files){const r=document.createElement("div");r.className="row";r.innerHTML='<div class="nm"><b></b><div class="mt"></div></div><div class="act"></div>';r.querySelector("b").textContent=f.name;
  r.querySelector(".mt").textContent=fmt(f.size)+" · "+new Date(f.modified).toLocaleString();
  const A=r.querySelector(".act");const b=(t,fn,c)=>{const x=document.createElement("button");x.textContent=t;if(c)x.className=c;x.onclick=fn;A.appendChild(x)};
  const link=base+"/files/"+f.name.split("/").map(encodeURIComponent).join("/");
  b("Copy link",()=>{navigator.clipboard.writeText(link);});b("Open",()=>window.open(link,"_blank"));
  if(can){b("Rename",async()=>{const n=prompt("New name",f.name.split("/").pop());if(!n)return;try{await api("/admin/api/rename",{method:"POST",headers:CT,body:JSON.stringify({from:f.name,to:n,space:"files"})});loadFiles()}catch(e){alert(e.message)}});
   if(/\\.zip$/i.test(f.name))b("Extract",async()=>{if(!confirm("Unpack "+f.name+" into a folder and remove the zip?"))return;try{const j=await api("/admin/api/files/extract",{method:"POST",headers:CT,body:JSON.stringify({name:f.name})});alert("Extracted to "+j.folder+"/");loadFiles()}catch(e){alert(e.message)}});
   b("Delete",async()=>{if(!confirm("Delete "+f.name+"?"))return;await api("/admin/api/files",{method:"DELETE",headers:CT,body:JSON.stringify({name:f.name,space:"files"})});loadFiles()},"d")}
  L.appendChild(r)}}catch(e){if(e.message!=="login")console.error(e)}}
const rdrop=$("#rdrop");rdrop.onclick=()=>$("#rpick").click();
["dragenter","dragover"].forEach(t=>rdrop.addEventListener(t,e=>{e.preventDefault();rdrop.classList.add("on")}));
["dragleave","drop"].forEach(t=>rdrop.addEventListener(t,e=>{e.preventDefault();rdrop.classList.remove("on")}));
rdrop.addEventListener("drop",e=>send([...e.dataTransfer.files],"rooms"));$("#rpick").onchange=e=>{send([...e.target.files],"rooms");e.target.value=""};
$("#rexp").onclick=async()=>{const m=$("#rexpm");m.textContent="Working ...";try{const d=await api("/admin/api/roomfolders/export",{method:"POST",headers:CT,body:"{}"});m.textContent="Wrote "+d.rooms.length+" room folder(s) to "+d.dir}catch(e){m.textContent=e.message}};
async function loadRoomFiles(){try{const d=await api("/admin/api/roomfiles");const can=ME&&rank(ME.role)>=2;$("#rdir").textContent=d.dir+"  ·  max "+Math.round(d.maxMB)+" MB per file";
 const L=$("#rlist");L.innerHTML="";$("#rempty").textContent=d.files.length?"":"No room files yet.";
 for(const f of d.files){const r=document.createElement("div");r.className="row";r.innerHTML='<div class="nm"><b></b><div class="mt"></div></div><div class="act"></div>';r.querySelector("b").textContent=f.name;
  const what=f.kind==="room"?f.objects+" objects"+(f.locked?" · "+f.locked+" locked":""):f.kind==="protobuf"?"game data (no object list)":f.kind==="json"?"JSON":f.kind==="large"?"large file":"unknown format - is this a room file?";
  r.querySelector(".mt").textContent=fmt(f.size)+" · "+what+" · "+new Date(f.modified).toLocaleString()+(f.used.length?" · used by "+f.used.map(u=>u.room+"/"+u.sub+(u.state==="staged"?" (staged)":"")).join(", "):"");
  const A=r.querySelector(".act");const b=(t,fn,c)=>{const x=document.createElement("button");x.textContent=t;if(c)x.className=c;x.onclick=fn;A.appendChild(x)};
  b("Copy name",()=>navigator.clipboard.writeText(f.name));b("Download",()=>{location.href="/admin/api/roomfile?name="+encodeURIComponent(f.name)});
  if(can){b("Use in room",async()=>{const v=prompt("Room id, and optionally a sub-room id (e.g.  2   or   100002 100004).\\nThe room will load this file.","");if(!v)return;const [ro,su]=v.trim().split(/[\\s,\\/:]+/);try{const j=await api("/admin/api/roomfiles/attach",{method:"POST",headers:CT,body:JSON.stringify({name:f.name,roomId:ro,subRoomId:su})});alert("Done: room "+j.roomId+"/"+j.subId+" ("+j.name+") now loads this file. Enter the room again to see it.");loadRoomFiles()}catch(e){alert(e.message)}});
   b("Delete",async()=>{if(!confirm("Delete "+f.name+"?"))return;try{await api("/admin/api/files",{method:"DELETE",headers:CT,body:JSON.stringify({name:f.name,space:"rooms"})});loadRoomFiles()}catch(e){alert(e.message)}},"d")}
  L.appendChild(r)}}catch(e){if(e.message!=="login")console.error(e)}}
const idrop=$("#idrop");let IMPZIP="";idrop.onclick=()=>$("#ipick").click();
["dragenter","dragover"].forEach(t=>idrop.addEventListener(t,e=>{e.preventDefault();idrop.classList.add("on")}));
["dragleave","drop"].forEach(t=>idrop.addEventListener(t,e=>{e.preventDefault();idrop.classList.remove("on")}));
async function impStart(files){const f=files[0];if(!f)return;$("#iplan").classList.add("hide");$("#iout").textContent="";const n=await up(f,"imports");if(n)impPlan(n)}
idrop.addEventListener("drop",e=>impStart([...e.dataTransfer.files]));$("#ipick").onchange=e=>{impStart([...e.target.files]);e.target.value=""};
const esc=t=>String(t).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
async function impPlan(name){IMPZIP=name;try{const d=await api("/admin/api/import/plan",{method:"POST",headers:CT,body:JSON.stringify({name})});const p=d.plan;let h="";
 for(const r of p.rooms){h+="<div style='margin-top:8px'><b>Room: "+esc(r.name)+"</b> <span class='mt'>"+(r.from?"from "+esc(r.from):"built from the room files")+(r.image?" · picture "+esc(r.image.split("/").pop()):"")+(r.loadScreen?" · loading screen "+esc(r.loadScreen.split("/").pop()):"")+(r.tags.length?" · tags "+esc(r.tags.join(", ")):"")+"</span>";
  for(const s of r.subs)h+="<div class='mt' style='margin-left:14px'>sub-room <b>"+esc(s.name)+"</b> → "+(s.file?esc(s.file.split("/").pop()):"<i>no data file (starts empty)</i>")+(s.scene?" · scene "+esc(String(s.scene).slice(0,8)):"")+"</div>";h+="</div>"}
 if(!p.rooms.length)h+="<div class='mt'>No room found in the zip - the files will just be stored.</div>";
 h+="<div class='mt' style='margin-top:8px'>"+p.files.length+" room file(s) · "+p.images.length+" picture(s)"+(p.unattached.length?" · "+p.unattached.length+" file(s) not attached to any room (stored only)":"")+(p.skipped.length?" · "+p.skipped.length+" skipped":"")+"</div>";
 for(const w of p.warnings)h+="<div class='msg err'>"+esc(w)+"</div>";for(const s of p.skipped)h+="<div class='mt'>skipped "+esc(s.entry)+": "+esc(s.reason)+"</div>";
 $("#isum").innerHTML=h;$("#iplan").classList.remove("hide");try{$("#iown").value=localStorage.getItem("hyd-imp-owner")||$("#iown").value}catch{}}catch(e){if(e.message!=="login"){$("#iout").className="msg err";$("#iout").textContent=e.message}}}
$("#ino").onclick=async()=>{if(IMPZIP)try{await api("/admin/api/import",{method:"DELETE",headers:CT,body:JSON.stringify({name:IMPZIP})})}catch{}IMPZIP="";$("#iplan").classList.add("hide")};
$("#igo").onclick=async()=>{const owner=$("#iown").value.trim();if(!owner){alert("Who should own the new room? Type a username or account id.");return}$("#igo").disabled=true;$("#iout").className="msg";$("#iout").textContent="Importing ...";
 try{try{localStorage.setItem("hyd-imp-owner",owner)}catch{}const j=await api("/admin/api/import/run",{method:"POST",headers:CT,body:JSON.stringify({name:IMPZIP,owner,roomName:$("#inm").value.trim(),scene:$("#isc").value.trim(),accessibility:Number($("#iacc").value)})});
  $("#iout").className="msg okc";$("#iout").textContent="Imported for "+j.owner+": "+(j.rooms.length?j.rooms.map(r=>"room "+r.roomId+" \\""+r.name+"\\" (sub-rooms "+r.subs.map(s=>s.id).join(", ")+")").join("; "):"no rooms")+" · "+j.files.length+" room file(s), "+j.images.length+" picture(s).";
  $("#iplan").classList.add("hide");IMPZIP="";loadRoomFiles()}catch(e){$("#iout").className="msg err";$("#iout").textContent=e.message}$("#igo").disabled=false};
boot();
</script></body></html>`;

console.log(`[ADMIN] panel ready at /admin  (folder ${DIR}, ${HOST ? "domain " + HOST : REMOTE ? "REMOTE ALLOWED (any host)" : "local only"}, ffmpeg ${HAS_FFMPEG ? "found" : "not found"}, ${Object.keys(loadUsers()).length} admin account(s) + admin key)`);
module.exports = { router };