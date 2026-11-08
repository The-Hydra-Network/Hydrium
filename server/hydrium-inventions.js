"use strict";

// Hydrium - inventions (UGC). Replaces the inventions part of hydrium-fixes4.js and the
// /api/inventions/v2/mine stub in compat.js. MOUNT IT BEFORE BOTH:
//   app.use(require("./hydrium-inventions").router);
// Same data file (data/inventions.json), so inventions you already saved show up.
//
//   POST v6/save, v9/save            save (a body with inventionId = new version of your own invention)
//   GET  v2/mine                     your inventions
//   GET  v1?inventionId=             one invention          GET v1/version?inventionId=&version=
//   GET  v1/details?inventionId=     tags                   GET v1/personaldetails/:id
//   GET/POST v2/batch                many by id (id=1&id=2)
//   GET  v2/search, v1/room, v1/fromcreators, v1/toptoday, v1/featured   published lists
//   GET/POST v1/update, v2/update, v2/metadata   edit        GET v3/publish, POST v4/publish, v2/unpublish
//   POST v2/delete, v1/delete, v1/updateprice, v1/settags, v1/cheer, v2/cheer, v1/report
//   GET  v1/tagfilters, v1/fulllineageowner

const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const router = express.Router();
const FILE = path.join(__dirname, "data", "inventions.json");
const CHEERS = path.join(__dirname, "data", "invention-cheers.json");
const json = express.json({ type: () => true, limit: "2mb" });
const form = express.urlencoded({ extended: true, limit: "2mb" });
const uuid = () => require("crypto").randomUUID();

let db = { next: 1, list: [] }, mt = -1;
function load() { // re-read when the file changes (so edits and the old module's writes are never lost)
    let m = 0; try { m = fs.statSync(FILE).mtimeMs; } catch { /* none yet */ }
    if (m === mt) return db;
    try { const d = JSON.parse(fs.readFileSync(FILE, "utf8")); db = { next: Number(d.next) || 1, list: Array.isArray(d.list) ? d.list : [] }; } catch { /* keep */ }
    const top = db.list.reduce((a, i) => Math.max(a, i.InventionId || 0), 0); if (db.next <= top) db.next = top + 1;
    mt = m; return db;
}
function save() { fs.mkdirSync(path.dirname(FILE), { recursive: true }); const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, FILE); try { mt = fs.statSync(FILE).mtimeMs; } catch { /* ignore */ } }
let cheers = null;
const cheerSet = () => { if (!cheers) { try { cheers = JSON.parse(fs.readFileSync(CHEERS, "utf8")); } catch { cheers = {}; } } return cheers; };
const saveCheers = () => { try { fs.mkdirSync(path.dirname(CHEERS), { recursive: true }); fs.writeFileSync(CHEERS, JSON.stringify(cheers)); } catch { /* ignore */ } };

function who(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try { const n = Number(jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET).sub); return Number.isSafeInteger(n) && n > 0 ? n : null; } catch { return null; }
}
const num = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);
const find = (id) => load().list.find((i) => i.InventionId === Number(id));
const isPub = (i) => i.IsPublished === true && !i.HideFromPlayer;
const ids = (req) => { const out = []; for (const src of [req.query, req.body]) { if (!src) continue; for (const k of ["id", "ids", "Id", "inventionId", "InventionId"]) { const v = src[k]; for (const x of Array.isArray(v) ? v : v != null ? String(v).split(",") : []) { const n = parseInt(x, 10); if (Number.isInteger(n)) out.push(n); } } } return out; };

// the stored record + the flat fields the newer client reads
function view(i) {
    const v = i.CurrentVersion || {};
    return { ...i, UgcVersion: i.UgcVersion || 1, LatestVersionNumber: i.CurrentVersionNumber || 1, ForceCannotPublish: false, IsRecRoomApproved: false,
        DisplayMetadataJson: i.DisplayMetadataJson || null, Tags: Array.isArray(i.Tags) ? i.Tags : [],
        CurrentVersion: { ...v, CreatedAt: v.CreatedAt || i.ModifiedAt, UgcAccessibility: v.UgcAccessibility ?? null } };
}
const envelope = (value, ok = true, error = null) => ({ Value: value, Success: ok, Error: error, error_id: null });
const tagObjs = (i) => (Array.isArray(i.Tags) ? i.Tags : []).map((t) => (typeof t === "string" ? { Tag: t, Type: 0 } : t));

function build(me, b, id) {
    const now = new Date().toISOString();
    const version = { InventionId: id, ReplicationId: uuid(), VersionNumber: 1, BlobName: String(b.inventionDataFilename || ""), BlobHash: null,
        InstantiationCost: num(b.instantiationCost), LightsCost: num(b.lightsCost), ChipsCost: num(b.chipsCost), CloudVariablesCost: num(b.cloudVariablesCost), AICost: num(b.aiCost),
        HasBetaContent: b.hasBetaContent === true, CreatedAt: now };
    return { InventionId: id, ReplicationId: uuid(), CreatorPlayerId: me, Name: String(b.name || "New Invention").slice(0, 24), Description: String(b.description || "").slice(0, 512),
        ImageName: String(b.imageName || ""), UgcVersion: num(b.ugcVersion, 1) || 1, CurrentVersionNumber: 1, CurrentVersion: version, Accessibility: 0, IsPublished: false, IsFeatured: false,
        ModifiedAt: now, CreatedAt: now, FirstPublishedAt: null, CreationRoomId: Number.isInteger(b.creationRoomId) ? b.creationRoomId : 0,
        NumPlayersHaveUsedInRoom: 0, NumDownloads: 0, CheerCount: 0, CreatorPermission: 0, GeneralPermission: 0, IsAGInvention: false, IsCertifiedInvention: false,
        Price: 0, AllowTrial: false, HideFromPlayer: false, ReferencedInventions: Array.isArray(b.referencedInventions) ? b.referencedInventions.filter((x) => Number.isInteger(x)) : [], Tags: [] };
}

// the game downloads an invention's data file from the cdn host: GET /invention/<filename>
// (the upload went to the same store as room data)
router.get(/^\/invention\/([\w.\-]+)$/, (req, res) => {
    let buf = null; try { buf = require("./room-saves").readBlob(req.params[0]); } catch { /* no room-saves */ }
    if (!buf) { console.log(`[INVENTIONS] no data file ${req.params[0]}`); return res.status(404).end(); }
    res.set({ "Content-Type": "application/octet-stream", "Content-Length": buf.length, "Cache-Control": "public, max-age=3600" }); res.end(buf);
});

// ---- save ----
function saveInvention(req, res, v9) {
    const me = who(req);
    const fail = (code, msg) => res.status(v9 ? (code === 401 ? 401 : 200) : code).json(v9 ? envelope(null, false, msg) : { error: msg });
    if (!me) return fail(401, "Unauthorized");
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (!b.inventionDataFilename) return fail(400, "inventionDataFilename is required");
    load();
    let rec = b.inventionId != null ? find(b.inventionId) : null;
    if (rec && rec.CreatorPlayerId !== me) return fail(403, "Not your invention");
    if (rec) { // a new version of your own invention
        const n = (rec.CurrentVersionNumber || 1) + 1, f = build(me, b, rec.InventionId).CurrentVersion;
        rec.CurrentVersion = { ...f, ReplicationId: rec.ReplicationId, VersionNumber: n }; rec.CurrentVersionNumber = n; rec.ModifiedAt = new Date().toISOString();
        if (typeof b.name === "string" && b.name.trim()) rec.Name = b.name.trim().slice(0, 24);
        if (typeof b.description === "string") rec.Description = b.description.slice(0, 512);
        if (b.imageName) rec.ImageName = String(b.imageName);
    } else { rec = build(me, b, db.next++); db.list.push(rec); }
    save();
    console.log(`[INVENTIONS] ${me} saved #${rec.InventionId} "${rec.Name}" v${rec.CurrentVersionNumber}`);
    const body = { Status: 0, Invention: view(rec), InventionVersion: view(rec).CurrentVersion };
    res.status(200).json(v9 ? envelope({ ...body, TagsResponse: { Result: 0, Tags: [] } }) : body);
}
router.post("/api/inventions/v6/save", json, (req, res) => saveInvention(req, res, false));
router.post("/api/inventions/v9/save", json, (req, res) => saveInvention(req, res, true));

// ---- reading ----
const newest = (a) => a.sort((x, y) => String(y.ModifiedAt).localeCompare(String(x.ModifiedAt)));
const page = (req, a) => { const skip = parseInt(req.query.skip, 10) || 0, take = parseInt(req.query.take, 10) || 100; return a.slice(skip, skip + take); };
router.get("/api/inventions/v2/mine", (req, res) => {
    const me = who(req); if (!me) return res.status(401).json({ error: "Unauthorized" });
    const mineList = newest(load().list.filter((i) => i.CreatorPlayerId === me && !i.Deleted));
    console.log(`[INVENTIONS] ${me} /mine -> ${mineList.length}`);
    res.json(mineList.map(view));
});
router.get("/api/inventions/v1", (req, res) => { const i = find(req.query.inventionId); if (!i || i.Deleted) return res.status(404).end(); res.json(view(i)); });
router.get("/api/inventions/v1/version", (req, res) => {
    const i = find(req.query.inventionId); if (!i || i.Deleted) return res.status(404).end();
    const v = parseInt(req.query.version, 10); if (v && v !== (i.CurrentVersionNumber || 1)) return res.status(404).end(); res.json(view(i).CurrentVersion);
});
router.get("/api/inventions/v1/details", (req, res) => { const i = find(req.query.inventionId); if (!i || i.Deleted) return res.status(404).end(); res.json({ Tags: tagObjs(i) }); });
router.get("/api/inventions/v1/personaldetails/:id", (req, res) => { const me = who(req); res.json({ IsCheered: !!(me && cheerSet()[me + ":" + req.params.id]) }); });
const batch = (req, res) => { const me = who(req), want = ids(req); res.json(want.map(find).filter((i) => i && !i.Deleted && (isPub(i) || (me && i.CreatorPlayerId === me))).map(view)); };
router.get("/api/inventions/v2/batch", batch);
router.post("/api/inventions/v2/batch", form, json, batch);
router.get("/api/inventions/v2/search", (req, res) => {
    const terms = String(req.query.value || "").toLowerCase().split(/\s+/).filter((t) => t && !t.startsWith("@") && !t.startsWith("#"));
    res.json(page(req, newest(load().list.filter((i) => isPub(i) && !i.Deleted && terms.every((t) => (i.Name + " " + i.Description).toLowerCase().includes(t))))).map(view));
});
router.get("/api/inventions/v1/room", (req, res) => res.json(page(req, newest(load().list.filter((i) => isPub(i) && !i.Deleted && i.CreationRoomId === parseInt(req.query.id, 10)))).map(view)));
router.get("/api/inventions/v1/fromcreators", (req, res) => { const c = new Set([].concat(req.query.id || req.query.creatorId || []).map(Number)); res.json(page(req, newest(load().list.filter((i) => isPub(i) && !i.Deleted && c.has(i.CreatorPlayerId)))).map(view)); });
router.get(["/api/inventions/v1/toptoday", "/api/inventions/v1/featured", "/api/inventions/v2/featured"], (req, res) => res.json(page(req, load().list.filter((i) => isPub(i) && !i.Deleted).sort((a, b) => (b.CheerCount - a.CheerCount) || String(b.ModifiedAt).localeCompare(String(a.ModifiedAt)))).map(view)));
router.get("/api/inventions/v1/tagfilters", (req, res) => res.json([]));
router.get("/api/inventions/v1/fulllineageowner", (req, res) => { const me = who(req); res.json(!!me && ids(req).every((n) => { const i = find(n); return i && i.CreatorPlayerId === me; })); });

// ---- editing (creator only) ----
function mine(req, res, id, v9) {
    const me = who(req);
    const no = (code, msg) => { v9 ? res.status(code === 401 ? 401 : 200).json(envelope(null, false, msg)) : res.status(code).json({ error: msg }); return null; };
    if (!me) return no(401, "Unauthorized");
    const i = find(id); if (!i || i.Deleted) return no(404, "No such invention");
    if (i.CreatorPlayerId !== me) return no(403, "Not your invention");
    return i;
}
const LADDER = { useonly: 20, editandsave: 40, publish: 60 };
const perm = (v) => { if (v == null || v === "") return undefined; const n = Number(v); if (Number.isFinite(n)) return n; return LADDER[String(v).toLowerCase().replace(/[_\s]/g, "")]; };
function patch(i, p) {
    if (typeof p.name === "string" && p.name.trim().length >= 3) i.Name = p.name.trim().slice(0, 24);
    if (typeof p.description === "string") i.Description = p.description.slice(0, 512);
    if (typeof p.imageName === "string" && p.imageName) i.ImageName = p.imageName;
    if (p.allowTrial != null) i.AllowTrial = p.allowTrial === true || p.allowTrial === "true" || p.allowTrial === "1" || p.allowTrial === 1;
    const pm = perm(p.permission); if (pm !== undefined) i.GeneralPermission = pm;
    i.ModifiedAt = new Date().toISOString();
}
router.all("/api/inventions/v1/update", json, (req, res) => {
    const i = mine(req, res, req.query.inventionId, false); if (!i) return;
    patch(i, req.query); save(); res.json({ Status: 0, Invention: view(i), InventionVersion: view(i).CurrentVersion });
});
function v9patch(req, res, meta) {
    const b = req.body || {}, i = mine(req, res, b.InventionId, true); if (!i) return;
    patch(i, { name: b.Name, description: b.Description, imageName: b.ImageName, allowTrial: b.AllowTrial, permission: b.Permission ?? b.GeneralPermission });
    if (meta && typeof b.LongDescription === "string") i.LongDescription = b.LongDescription;
    if (meta && b.TagsRequest && typeof b.TagsRequest === "object") setTags(i, b.TagsRequest);
    save(); res.json(envelope({ Status: 0, Invention: view(i), InventionVersion: view(i).CurrentVersion, TagsResponse: { Result: 0, Tags: tagObjs(i).map((t) => t.Tag) } }));
}
router.post("/api/inventions/v2/update", json, (req, res) => v9patch(req, res, false));
router.post("/api/inventions/v2/metadata", json, (req, res) => v9patch(req, res, true));
function setTags(i, b) {
    const clean = (a) => (Array.isArray(a) ? a : []).filter((t) => typeof t === "string").map((t) => t.trim().toLowerCase()).filter((t) => /^[a-z]{1,15}$/.test(t));
    i.Tags = [...clean(b.AutoTags).map((Tag) => ({ Tag, Type: 2 })), ...clean(b.CustomTags).map((Tag) => ({ Tag, Type: 0 }))];
}
router.post("/api/inventions/v1/settags", json, (req, res) => {
    const b = req.body || {}, i = mine(req, res, b.InventionId, false); if (!i) return;
    setTags(i, b); save(); res.json(tagObjs(i).map((t) => t.Tag));
});
function publish(i, level, price) {
    const now = new Date().toISOString(); i.IsPublished = true; i.Accessibility = 1; i.ModifiedAt = now; if (!i.FirstPublishedAt) i.FirstPublishedAt = now;
    const pm = perm(level); i.GeneralPermission = pm !== undefined ? pm : i.GeneralPermission || 20;
    if (Number.isFinite(price) && price >= 0) i.Price = Math.min(price, 1000);
}
router.all("/api/inventions/v3/publish", json, (req, res) => { const i = mine(req, res, req.query.inventionId, false); if (!i) return; publish(i, req.query.permissionLevel, parseInt(req.query.price, 10)); save(); console.log(`[INVENTIONS] #${i.InventionId} published`); res.json({ Status: 0, Invention: view(i), InventionVersion: view(i).CurrentVersion }); });
router.all("/api/inventions/v4/publish", json, (req, res) => {
    const b = { ...req.query, ...(req.body || {}) }, i = mine(req, res, b.InventionId ?? b.inventionId, true); if (!i) return;
    publish(i, b.Permission ?? b.permissionLevel, num(b.Price ?? b.price, NaN)); save(); console.log(`[INVENTIONS] #${i.InventionId} published`);
    res.json(envelope({ Status: 0, Invention: view(i), InventionVersion: view(i).CurrentVersion, TagsResponse: { Result: 0, Tags: tagObjs(i).map((t) => t.Tag) } }));
});
router.all(["/api/inventions/v2/unpublish", "/api/inventions/v4/unpublish", "/api/inventions/v1/unpublish"], json, (req, res) => {
    const b = { ...req.query, ...(req.body || {}) }, i = mine(req, res, b.InventionId ?? b.inventionId, true); if (!i) return;
    i.IsPublished = false; i.Accessibility = 0; i.ModifiedAt = new Date().toISOString(); save(); res.json(envelope({ Status: 0, Invention: view(i), InventionVersion: view(i).CurrentVersion }));
});
router.post("/api/inventions/v1/updateprice", json, (req, res) => {
    const b = { ...req.query, ...(req.body || {}) }, i = mine(req, res, b.InventionId ?? b.inventionId, false); if (!i) return;
    const p = num(b.Price ?? b.price, NaN); if (Number.isFinite(p) && p >= 0) i.Price = Math.min(p, 1000); save(); res.json({ Status: 0, Invention: view(i), InventionVersion: view(i).CurrentVersion });
});
router.all(["/api/inventions/v2/delete", "/api/inventions/v1/delete"], json, (req, res) => {
    const b = { ...req.query, ...(req.body || {}) }, i = mine(req, res, b.InventionId ?? b.inventionId, true); if (!i) return;
    i.Deleted = true; i.IsPublished = false; save(); console.log(`[INVENTIONS] #${i.InventionId} deleted`); res.json(envelope(null));
});
function cheer(req, res, v2) {
    const me = who(req), b = req.body || {}, id = Number(b.InventionId);
    if (!me) return res.status(401).json(v2 ? envelope(null, false, "Unauthorized") : { success: false, error: "Unauthorized" });
    const i = find(id); if (!i || typeof b.Cheer !== "boolean") return res.status(v2 ? 200 : 404).json(v2 ? envelope(null, false, "No such invention") : { success: false, error: "No such invention" });
    const c = cheerSet(), k = me + ":" + id; if (b.Cheer) c[k] = 1; else delete c[k]; saveCheers();
    i.CheerCount = Object.keys(c).filter((x) => x.endsWith(":" + id)).length; save();
    res.json(v2 ? envelope(null) : { success: true, error: "" });
}
router.post("/api/inventions/v1/cheer", json, (req, res) => cheer(req, res, false));
router.post("/api/inventions/v2/cheer", json, (req, res) => cheer(req, res, true));
// buying (everything is free here): the client only checks Success and reads Value.Invention
function buy(req, res) {
    const me = who(req), b = { ...req.query, ...(req.body || {}) }, i = find(b.inventionId ?? b.InventionId);
    if (!me) return res.status(401).json(envelope(null, false, "Unauthorized"));
    if (!i || i.Deleted || !(isPub(i) || i.CreatorPlayerId === me)) return res.json(envelope(null, false, "No such invention"));
    i.NumDownloads = (i.NumDownloads || 0) + 1; save(); console.log(`[INVENTIONS] ${me} got #${i.InventionId} "${i.Name}" (free)`);
    res.json(envelope({ Status: 0, Invention: view(i), InventionVersion: null, TagsResponse: null }));
}
router.get(["/api/storefronts/v2/buyInvention", "/api/storefronts/v3/buyInvention"], buy);
router.post(["/api/storefronts/v2/buyInvention", "/api/storefronts/v3/buyInvention"], json, buy);
router.post("/api/inventions/v1/report", json, (req, res) => res.json({ success: true, error: "" }));

// If something mounted earlier still answers /api/inventions/v2/mine with [], call this instead of
// app.use(...): it puts this router at the very front of the app.   require("./hydrium-inventions").first(app)
function first(app) { app.use(router); const st = (app.router || app._router).stack; st.unshift(st.pop()); }

module.exports = { router, first };