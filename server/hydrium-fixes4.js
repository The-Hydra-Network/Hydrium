"use strict";

// Hydrium - inventions (saving what you build with the Maker Pen), photo captions/cheers,
// "avoid juniors". RecFlare shapes. Mount before app.use(auth) and before app.use(api):
//   app.use(require("./hydrium-fixes4").router);
//
//   POST /api/inventions/v6/save, v9/save   store the invention, answer { Status, Invention, InventionVersion }
//   GET  /api/inventions/v2/mine            your saved inventions
//   POST /api/images/v1/modifydescription   edit a photo caption
//   POST /api/images/v1/cheer               cheer / un-cheer a photo
//   GET/PUT /player/avoidjuniors            the "avoid juniors" preference (bare true/false)
// Data: data/inventions.json, data/image-cheers.json, data/avoid-juniors.json

const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

let images = null;
try { images = require("./images"); } catch { /* photo routes then do nothing */ }

const router = express.Router();
const DIR = path.join(__dirname, "data");
const json = express.json({ type: () => true, limit: "2mb" });
const form = express.urlencoded({ extended: true });

function load(name, fallback) { try { return JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8")); } catch { return fallback; } }
function save(name, v) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, name), JSON.stringify(v, null, 2)); }

function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const n = Number(jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET).sub);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    } catch { return null; }
}

// ---------- inventions ----------
let inv = load("inventions.json", { next: 1, list: [] });
const uuid = () => require("crypto").randomUUID();

function build(me, b) {
    const now = new Date().toISOString();
    const id = inv.next++;
    const num = (v) => (typeof v === "number" ? v : 0);
    const version = {
        InventionId: id, ReplicationId: uuid(), VersionNumber: 1,
        BlobName: String(b.inventionDataFilename || ""), BlobHash: null,
        InstantiationCost: num(b.instantiationCost), LightsCost: num(b.lightsCost), ChipsCost: num(b.chipsCost),
        CloudVariablesCost: num(b.cloudVariablesCost), AICost: num(b.aiCost),
        HasBetaContent: b.hasBetaContent === true,
    };
    return {
        InventionId: id, ReplicationId: uuid(), CreatorPlayerId: me,
        Name: String(b.name || "New Invention").slice(0, 24), Description: String(b.description || "").slice(0, 512),
        ImageName: String(b.imageName || ""),
        CurrentVersionNumber: 1, CurrentVersion: version,
        Accessibility: 0, IsPublished: false, IsFeatured: false,
        ModifiedAt: now, CreatedAt: now, FirstPublishedAt: null,
        CreationRoomId: Number.isInteger(b.creationRoomId) ? b.creationRoomId : 0,
        NumPlayersHaveUsedInRoom: 0, NumDownloads: 0, CheerCount: 0,
        CreatorPermission: 0, GeneralPermission: 0, IsAGInvention: false, IsCertifiedInvention: false,
        Price: 0, AllowTrial: false, HideFromPlayer: false,
        ReferencedInventions: Array.isArray(b.referencedInventions) ? b.referencedInventions.filter((x) => Number.isInteger(x)) : [],
        Tags: [],
    };
}

function saveInvention(req, res, v9) {
    const me = accountId(req);
    if (!me) return res.status(401).json(v9 ? { Value: null, Success: false, Error: "Unauthorized", error_id: null } : { error: "Unauthorized" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (!b.inventionDataFilename) {
        return res.status(v9 ? 200 : 400).json(v9 ? { Value: null, Success: false, Error: "inventionDataFilename is required", error_id: null } : { error: "inventionDataFilename is required" });
    }
    const rec = build(me, b);
    inv.list.push(rec);
    save("inventions.json", inv);
    console.log(`[INVENTIONS] ${me} saved #${rec.InventionId} "${rec.Name}"`);
    const body = { Status: 0, Invention: rec, InventionVersion: rec.CurrentVersion };
    if (!v9) return res.status(200).json(body);
    res.status(200).json({ Value: { ...body, TagsResponse: { Result: 0, Tags: [] } }, Success: true, Error: null, error_id: null });
}
router.post("/api/inventions/v6/save", json, (req, res) => saveInvention(req, res, false));
router.post("/api/inventions/v9/save", json, (req, res) => saveInvention(req, res, true));

router.get("/api/inventions/v2/mine", (req, res) => {
    const me = accountId(req);
    res.status(200).json(me ? inv.list.filter((i) => i.CreatorPlayerId === me) : []);
});

// ---------- photo captions and cheers ----------
router.post("/api/images/v1/modifydescription", json, (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (!b.ImageName) return res.status(400).json({ error: "ImageName is required" });
    const rec = images && images.findRecord({ name: String(b.ImageName) });
    if (!rec || !rec.Id) return res.status(404).end();
    if (rec.PlayerId !== me) return res.status(403).json({ error: "Not your image" });
    rec.Description = typeof b.Description === "string" && b.Description.trim() ? b.Description.slice(0, 1000) : null;
    console.log(`[PHOTOS] ${me} set caption of photo #${rec.Id}`);
    res.status(200).json({ success: true });
});

router.post("/api/images/v1/cheer", json, (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof b.SavedImageId === "number") {
        const cheers = load("image-cheers.json", {});
        const set = new Set(cheers[b.SavedImageId] || []);
        if (b.Cheer === true) set.add(me); else set.delete(me);
        cheers[b.SavedImageId] = [...set];
        save("image-cheers.json", cheers);
        const rec = images && images.findRecord({ id: b.SavedImageId });
        if (rec) rec.CheerCount = set.size;
    }
    res.status(200).json({ success: true });
});

// ---------- avoid juniors ----------
router.get("/player/avoidjuniors", (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    res.status(200).json(load("avoid-juniors.json", {})[me] === true);
});
router.put("/player/avoidjuniors", form, json, (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const raw = Object.keys(b).length ? Object.values(b)[0] : undefined;
    const all = load("avoid-juniors.json", {});
    if (raw !== undefined) { all[me] = /^(true|1)$/i.test(String(raw)); save("avoid-juniors.json", all); }
    res.status(200).json(all[me] === true);
});

module.exports = { router };
