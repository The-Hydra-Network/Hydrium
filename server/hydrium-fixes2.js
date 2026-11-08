"use strict";

// Hydrium - POST /api/equipment/v1/update (favourite flags), POST /invite (game invites),
// GET /showcase/:id and POST /api/PlayerCheer/v1/SetSelectedCheer.
// Mount before app.use(auth), e.g. next to hydrium-econ-buy:
//   app.use(require("./hydrium-fixes2").router);

const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const router = express.Router();
const FILE = path.resolve(process.env.INVITES_FILE || path.join(__dirname, "data", "invites.json"));
const json = express.json({ type: () => true, limit: "200kb" });
const form = express.urlencoded({ extended: true });

function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const n = Number(jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET).sub);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    } catch { return null; }
}

// RecFlare: applies Favorited flags by ModificationGuid, empty 200 body, 400 if not an array.
// Equipment favourites are kept in data/equipment-favorites.json.
const FAV = path.resolve(path.join(__dirname, "data", "equipment-favorites.json"));
function favs() { try { return JSON.parse(fs.readFileSync(FAV, "utf8")); } catch { return {}; } }
router.all("/api/equipment/v1/update", (req, res, next) => {
    if (req.method !== "PUT" && req.method !== "POST") return next();
    json(req, res, () => {
        const me = accountId(req);
        if (!me) return res.status(401).json({ error: "Unauthorized" });
        if (!Array.isArray(req.body)) return res.status(400).end();
        const all = favs();
        const mine = (all[me] ||= {});
        for (const e of req.body) {
            if (e && typeof e.ModificationGuid === "string" && e.ModificationGuid) {
                if (e.Favorited === true) mine[e.ModificationGuid] = true; else delete mine[e.ModificationGuid];
            }
        }
        fs.mkdirSync(path.dirname(FAV), { recursive: true });
        fs.writeFileSync(FAV, JSON.stringify(all, null, 2));
        console.log(`[EQUIP] ${me} updated ${req.body.length} favourite flag(s)`);
        res.status(200).end();
    });
});

// RecFlare: records the invite and answers { RoomInviteId, FromPlayerId, ToPlayerId, RoomId }.
// (Live delivery to the other player needs the notify hub and is not done here.)
router.post("/invite", form, json, (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const to = Number.parseInt(String(b.playerId ?? ""), 10);
    if (!to) return res.status(400).end();
    let db = { next: 1, invites: [] };
    try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* first run */ }
    const inst = Number.parseInt(String(b.roomInstanceId ?? ""), 10) || 0;
    const invite = { RoomInviteId: db.next++, FromPlayerId: me, ToPlayerId: to, RoomId: null, RoomInstanceId: inst };
    db.invites.push(invite);
    db.invites = db.invites.slice(-200);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
    console.log(`[INVITE] ${me} -> ${to} (instance ${inst})`);
    const { RoomInstanceId, ...out } = invite;
    res.status(200).json(out);
});

// RecFlare: a profile's showcased rooms - nothing stores them, so an empty bare array.
router.get("/showcase/:playerId", (req, res, next) => {
    if (!/^\d+$/.test(req.params.playerId)) return next();
    res.status(200).json([]);
});

// RecFlare: pins a cheer category (form body CheerCategory; -1 unpins), answers { Success, Message }.
const CHEER = path.resolve(path.join(__dirname, "data", "selected-cheer.json"));
router.post("/api/PlayerCheer/v1/SetSelectedCheer", form, json, (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const cat = Number.parseInt(String(b.CheerCategory ?? ""), 10);
    if (![-1, 0, 10, 20, 30, 40].includes(cat)) {
        return res.status(200).json({ Success: false, Message: "CheerCategory is not a cheer category" });
    }
    let all = {};
    try { all = JSON.parse(fs.readFileSync(CHEER, "utf8")); } catch { /* first run */ }
    all[me] = cat === -1 ? 0 : cat;
    fs.mkdirSync(path.dirname(CHEER), { recursive: true });
    fs.writeFileSync(CHEER, JSON.stringify(all, null, 2));
    console.log(`[CHEER] ${me} selected cheer ${cat}`);
    res.status(200).json({ Success: true, Message: null });
});

module.exports = { router };
