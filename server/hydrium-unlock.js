// hydrium-unlock.js - makes the pre-placed props / walls of a room editable.
// The game downloads a room's contents as a data file (GET /room/<file>). Props that are "locked" inside that file cannot be
// grabbed with the Maker Pen. This module sits in front of hydrium-rooms' /room/<file> route, flips every lock flag in the file
// (JSON, plain or gzip) while it is sent, and leaves the file on disk untouched.
//   Mount BEFORE hydrium-rooms:   app.use(require("./hydrium-unlock").router);
//   Env: ROOM_UNLOCK=0 turns it off.   ROOM_UNLOCK_DEBUG=1 also prints every flag name it saw.
//        ROOM_UNLOCK_FLAGS=4   which flag numbers inside each object's flag block (field 14) are removed. Default 4 = "locked".
// Room files from the game are protobuf. Every object in one carries a flag block; flag 4 is only ever set on objects that
// never moved in your saves (pool table, tv camera ...), so it is the lock. Removing it makes the object grabbable again.
// It writes one line per file to the server log ([UNLOCK] ...). If it says "0 lock flags", the file has no flag it knows
// about: send me that log line.
const express = require("express");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const router = express.Router();
const BASE = path.resolve(__dirname, "roomdata", "room");
const ON = process.env.ROOM_UNLOCK !== "0", DEBUG = process.env.ROOM_UNLOCK_DEBUG === "1";
const LOCKED = /^(is|was|m_|_)?(locked|lock|islocked|readonly|read_only|noedit|noteditable|uneditable|noneditable|preplaced|pre_placed|isPreplaced|lockedinplace|locked_in_place|protected|isprotected|fixed|isfixed)$/i;
const OPEN = /^(is|can|m_|_)?(editable|edit|canedit|canbeedited|movable|canmove|canbemoved|grabbable|cangrab|selectable|canselect|deletable|candelete|canbedeleted)$/i;

function walk(v, st, depth) {
    if (depth > 200 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) walk(x, st, depth + 1); return; }
    for (const k of Object.keys(v)) {
        const x = v[k];
        if (typeof x === "boolean" || x === 0 || x === 1) {
            if (DEBUG && /lock|edit|move|grab|select|delete|preplace|protect|readonly|fixed/i.test(k)) st.seen[k] = (st.seen[k] || 0) + 1;
            if (typeof x === "boolean" || typeof x === "number") {
                if (LOCKED.test(k) && x && x !== 0) { v[k] = typeof x === "boolean" ? false : 0; st.locked++; }
                else if (OPEN.test(k) && !x) { v[k] = typeof x === "boolean" ? true : 1; st.opened++; }
            }
        } else if (x && typeof x === "object") walk(x, st, depth + 1);
    }
}


// ---------- protobuf (the game's own room-file format) ----------
const FLAGS = new Set(String(process.env.ROOM_UNLOCK_FLAGS || "4").split(/[ ,]+/).filter(Boolean).map(Number));
function rv(b, i) { let r = 0, m = 1; for (;;) { if (i >= b.length) throw new Error("eof"); const c = b[i++]; r += (c & 0x7f) * m; m *= 128; if (c < 0x80) return [r, i]; } }
function wv(n) { const o = []; while (n >= 0x80) { o.push((n % 128) | 0x80); n = Math.floor(n / 128); } o.push(n); return Buffer.from(o); }
function pbParse(b) { // -> [{f, w, v(Buffer|number)}] or null when b is not a protobuf message
    const out = []; let i = 0;
    try {
        while (i < b.length) {
            let k; [k, i] = rv(b, i); const f = Math.floor(k / 8), w = k % 8; if (f === 0) return null;
            if (w === 0) { let v; [v, i] = rv(b, i); out.push({ f, w, v }); }
            else if (w === 1) { if (i + 8 > b.length) return null; out.push({ f, w, v: b.subarray(i, i + 8) }); i += 8; }
            else if (w === 5) { if (i + 4 > b.length) return null; out.push({ f, w, v: b.subarray(i, i + 4) }); i += 4; }
            else if (w === 2) { let l; [l, i] = rv(b, i); if (i + l > b.length) return null; out.push({ f, w, v: b.subarray(i, i + l) }); i += l; }
            else return null;
        }
    } catch { return null; }
    return out;
}
function pbEncode(list) {
    const parts = [];
    for (const { f, w, v } of list) {
        parts.push(wv(f * 8 + w));
        if (w === 0) parts.push(wv(v)); else if (w === 2) { parts.push(wv(v.length), v); } else parts.push(v);
    }
    return Buffer.concat(parts);
}
// returns {buf, removed, objects} or null when this is not a room file
function unlockProto(raw) {
    const top = pbParse(raw); if (!top || !top.length) return null;
    const objs = top.filter((x) => x.f === 2 && x.w === 2); if (!objs.length) return null;
    let removed = 0, seen = 0;
    const next = top.map((x) => {
        if (x.f !== 2 || x.w !== 2) return x;
        const o = pbParse(x.v); if (!o) return x;
        seen++; let dirty = false;
        const no = o.map((y) => {
            if (y.f !== 14 || y.w !== 2) return y;
            const fl = pbParse(y.v); if (!fl) return y;
            const keep = fl.filter((z) => !(FLAGS.has(z.f) && z.w === 0 && z.v !== 0));
            if (keep.length === fl.length) return y;
            removed += fl.length - keep.length; dirty = true;
            return { f: 14, w: 2, v: pbEncode(keep) };
        });
        return dirty ? { f: 2, w: 2, v: pbEncode(no) } : x;
    });
    if (!seen) return null;
    return { buf: removed ? pbEncode(next) : raw, removed, objects: seen };
}

const cache = new Map(); // file -> {mtime, buf, note}
function transform(abs) {
    const st = fs.statSync(abs), c = cache.get(abs);
    if (c && c.mtime === st.mtimeMs) return c;
    const raw = fs.readFileSync(abs);
    let body = raw, gz = false;
    if (raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b) { try { body = zlib.gunzipSync(raw); gz = true; } catch { body = raw; } }
    const out = { mtime: st.mtimeMs, buf: raw, note: "", changed: false };
    const proto = unlockProto(body);
    if (proto) {
        const name0 = path.relative(BASE, abs);
        if (proto.removed) { out.changed = true; out.buf = gz ? zlib.gzipSync(proto.buf) : proto.buf; out.note = `room file, ${proto.objects} objects: ${proto.removed} lock flag(s) removed`; }
        else out.note = `room file, ${proto.objects} objects: nothing locked, sent unchanged`;
        out.name = name0; cache.set(abs, out); console.log(`[UNLOCK] room/${name0}: ${out.note}`); return out;
    }
    let json = null;
    try { json = JSON.parse(body.toString("utf8").replace(/^﻿/, "")); } catch {}
    const name = path.relative(BASE, abs);
    if (json === null) {
        out.note = `unknown format (${body.length} bytes, starts ${body.subarray(0, 8).toString("hex")}) - sent unchanged`;
    } else {
        const s = { locked: 0, opened: 0, seen: {} };
        walk(json, s, 0);
        if (s.locked || s.opened) {
            const text = JSON.stringify(json);
            out.changed = true; out.buf = gz ? zlib.gzipSync(Buffer.from(text)) : Buffer.from(text);
            out.note = `${s.locked} lock flag(s) cleared, ${s.opened} edit flag(s) set${gz ? " (gzip)" : ""}`;
        } else out.note = `0 lock flags found${gz ? " (gzip)" : ""}, sent unchanged` + (DEBUG ? " | flags seen: " + JSON.stringify(s.seen) : " | top-level keys: " + (Array.isArray(json) ? "[array " + json.length + "]" : Object.keys(json).slice(0, 12).join(",")));
    }
    out.name = name; cache.set(abs, out);
    console.log(`[UNLOCK] room/${name}: ${out.note}`);
    return out;
}

router.get(/^\/room\/(.+)$/, (req, res, next) => {
    if (!ON) return next();
    let rel; try { rel = decodeURIComponent(req.params[0] || ""); } catch { return next(); }
    const abs = path.resolve(BASE, rel);
    if (abs !== BASE && !abs.startsWith(BASE + path.sep)) return next();
    let ok = false; try { ok = fs.statSync(abs).isFile(); } catch {}
    if (!ok) return next();
    let t; try { t = transform(abs); } catch (e) { console.log("[UNLOCK] " + e.message); return next(); }
    if (!t.changed) return next(); // nothing to change: the normal route serves it (with Range etc.)
    const total = t.buf.length, m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
    res.set({ "Content-Type": "application/octet-stream", "Accept-Ranges": "bytes" });
    if (m && (m[1] || m[2])) {
        let a = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2])), b = m[1] && m[2] ? Number(m[2]) : total - 1;
        b = Math.min(b, total - 1);
        if (a > b || a >= total) return res.status(416).set("Content-Range", `bytes */${total}`).end();
        res.status(206).set({ "Content-Range": `bytes ${a}-${b}/${total}`, "Content-Length": b - a + 1 }); return res.end(t.buf.subarray(a, b + 1));
    }
    res.set("Content-Length", total); res.end(t.buf);
});

console.log(ON ? "[UNLOCK] room files are unlocked while they are sent (ROOM_UNLOCK=0 to turn off)" : "[UNLOCK] off");
module.exports = { router };