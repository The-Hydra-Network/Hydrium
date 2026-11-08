"use strict";

// Hydrium - player presence + avatar-item store lists, shapes from RecFlare.
//   GET|POST /player?id=1&id=2     one presence entry per id (the friends list asks this)
//   GET /api/customAvatarItems/v1/search, /featured     bare arrays (nothing is for sale yet)
//
// A player counts as online while their game keeps sending heartbeats
// (POST /player/heartbeat or /data/heartbeat with their login token), for ONLINE_SECONDS after the last one.
// Room details are not tracked yet, so an online friend shows without a room.
//
// Mount in index.js before app.use(auth), e.g. after the hydrium-rooms line:
//   app.use(require("./hydrium-presence").router);

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();
const SECRET = process.env.HYDRIUM_JWT_SECRET || "hydrium-development-secret";
const ONLINE_SECONDS = Math.max(30, parseInt(process.env.PRESENCE_ONLINE_SECONDS || "150", 10) || 150);
const GAME_VERSION = process.env.GAME_VERSION || "20231207";

let live = null; try { live = require("./hydrium-live"); } catch { /* live module not installed */ }
const roomOf = (id) => (live ? live.where(id) : null);

const lastSeen = new Map(); // accountId -> ms

function tokenClaims(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        return jwt.verify(h.slice(7).trim(), SECRET);
    } catch {
        return null;
    }
}
const idOf = (claims) => {
    const n = Number(claims && claims.sub);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// note who is alive, then carry on to the real handler
router.use(["/player/heartbeat", "/data/heartbeat", "/player/login", "/player/loginlock"], (req, res, next) => {
    const id = idOf(tokenClaims(req));
    if (id) lastSeen.set(id, Date.now());
    next();
});
router.post("/player/logout", (req, res, next) => {
    const id = idOf(tokenClaims(req));
    if (id) lastSeen.delete(id);
    next();
});

const online = (id) => Date.now() - (lastSeen.get(id) || 0) < ONLINE_SECONDS * 1000;

function payload(id, caller) {
    const isOnline = online(id) || id === caller; // whoever asks is obviously online
    return {
        appVersion: GAME_VERSION,
        deviceClass: 0,
        errorCode: 0,
        isOnline,
        playerId: id,
        roomInstance: isOnline ? roomOf(id) : null,
        statusVisibility: 0,
        vrMovementMode: 1,
        platform: 0,
        photonAuthToken: null,
        photonRealtimeAppId: null,
        photonVoiceAppId: null,
        photonChatAppId: null,
        photonRegion: null,
        photonRoomId: null,
        voiceConnectionInfo: null,
        voiceServerId: null,
        experiments: null,
    };
}

function batch(req, res) {
    const raw = [req.query.id, req.body && typeof req.body === "object" ? (req.body.id ?? req.body.Id) : undefined].flat().filter((v) => v !== undefined);
    const ids = [...new Set(raw.map((v) => Number.parseInt(String(v).trim(), 10)).filter((n) => !Number.isNaN(n)))];
    const caller = idOf(tokenClaims(req));
    if (ids.length === 0) return res.status(200).json([{ ...payload(1, caller), isOnline: true }]);
    res.status(200).json(ids.map((id) => payload(id, caller)));
}
router.get("/player", batch);
router.post("/player", express.urlencoded({ extended: true }), express.json({ type: () => true, limit: "50kb" }), batch);

router.get("/api/customAvatarItems/v1/search", (req, res) => res.status(200).json([]));
router.get("/api/customAvatarItems/v1/featured", (req, res) => res.status(200).json([]));

module.exports = { router, isOnline: online };