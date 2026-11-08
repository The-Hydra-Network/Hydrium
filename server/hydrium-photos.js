"use strict";

// Hydrium - camera photos and the photo gallery.
//
// Why photos never showed up:
//   * POST /api/images/v4/uploadsaved stored the file but ignored the game's JSON "imgMeta" field
//     (savedImageType, roomId, accessibility, description, tagged players), so every photo was saved
//     as type 0 with no room.
//   * GET /api/images/v5/player/:id (the gallery) was a stub that always answered an empty list.
//
// This module re-does the upload with imgMeta read properly and serves the gallery from the real
// photo records (RecFlare: { Results, TotalResults }). It also adds three small acks seen as 404s:
// POST /player/notifydisconnect, GET /rooms/visitedby/:id.
//
// Needs images.js (the image server) in the same folder. Mount BEFORE app.use(api) / compat:
//   app.use(require("./hydrium-photos").router);

const express = require("express");
const jwt = require("jsonwebtoken");
const images = require("./images");

const router = express.Router();

function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const n = Number(jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET).sub);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    } catch { return null; }
}

router.post("/api/images/v4/uploadsaved", express.raw({ type: () => true, limit: "25mb" }), (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const ct = req.headers["content-type"] || "";
    const bytes = images.imageFromBody(req.body, ct);
    if (!bytes) return res.status(400).json({ error: "No file found in request" });
    let imageName;
    try { imageName = images.saveImage(bytes); } catch (e) { return res.status(400).json({ error: "image is not a PNG or JPEG image" }); }

    const fields = { ...req.query, ...images.fieldsFromBody(req.body, ct) };
    let meta = {};
    if (typeof fields.imgMeta === "string") { try { meta = JSON.parse(fields.imgMeta) || {}; } catch { /* keep {} */ } }
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    const roomId = num(meta.roomId);
    const evId = num(meta.playerEventId);
    const record = images.addRecord({
        imageName,
        playerId: me,
        fields: {
            type: num(meta.savedImageType) ?? 0,
            accessibility: num(meta.accessibility) ?? 1,
            description: typeof meta.description === "string" ? meta.description : undefined,
            taggedplayerids: Array.isArray(meta.playerIds) ? meta.playerIds.filter((v) => typeof v === "number").join(",") : undefined,
            roomid: roomId > 0 ? roomId : undefined,
            playereventid: evId > 0 ? evId : undefined,
        },
    });
    console.log(`[PHOTOS] ${me} saved photo #${record.Id} type=${record.Type} room=${record.RoomId} (${bytes.length} bytes)`);
    // The 2023 client reads the full record; keep the fields the old handler sent.
    res.status(200).json({ ...record, ThumbnailFileName: imageName, ImageName: imageName, Success: true });
});

router.get("/api/images/v5/player/:id", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const playerId = Number(req.params.id);
    const me = accountId(req);
    const sort = String(req.query.sort || "0");
    let all = images.listRecords({ playerId, take: 500, skip: 0 });
    if (me !== playerId) all = all.filter((r) => r.Accessibility === 1); // others only see public photos
    if (sort === "1") all = all.slice().reverse();
    const skip = Math.max(Number.parseInt(req.query.skip, 10) || 0, 0);
    const take = Math.min(Math.max(Number.parseInt(req.query.take, 10) || 100, 1), 500);
    console.log(`[PHOTOS] gallery ${playerId}: ${all.length} photo(s)`);
    res.status(200).json({ Results: all.slice(skip, skip + take), TotalResults: all.length });
});

router.post("/player/notifydisconnect", (req, res) => res.status(200).end());

router.get("/rooms/visitedby/:id", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    res.status(200).json([]);
});

module.exports = { router };
