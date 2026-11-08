// hydrium-dorm.js - makes the Maker Pen work in the dorm.
// The dorm room (RoomId 1) was served with no owner (CreatorAccountId 0, Roles []) and a
// non-sandbox sub room, so the game saw "this isn't your room" and refused the pen.
// This wraps GET /rooms/1 and GET|POST /rooms/bulk and personalises room 1 per requester:
// creator + owner role = you, sandbox on. Other rooms are untouched.
// Mount it BEFORE `api` (and before auth), e.g. right after hydrium-rooms:
//   app.use(require("./hydrium-dorm").router);
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const DORM_ID = 1;
const OWNER_ROLE = 255;           // RecFlare Role.Creator

function me(req) {
    const h = String(req.headers.authorization || "");
    const t = h.replace(/^Bearer\s+/i, "");
    if (!t) return null;
    let d = null;
    try { d = process.env.HYDRIUM_JWT_SECRET ? jwt.verify(t, process.env.HYDRIUM_JWT_SECRET, { algorithms: ["HS256"] }) : null; } catch (_) {}
    const id = Number(d && d.sub);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function personalise(room, id) {
    if (!room || typeof room !== "object" || Number(room.RoomId) !== DORM_ID) return room;
    const out = { ...room };
    out.IsDorm = true;
    out.CreatorAccountId = id;
    out.Roles = [{ AccountId: id, Role: OWNER_ROLE, LastChangedByAccountId: null, InvitedRole: 0 }];
    out.CoOwners = []; out.Hosts = [];
    out.CloningAllowed = false;
    out.MaxPlayers = Math.max(Number(out.MaxPlayers) || 1, 4);
    out.SubRooms = (out.SubRooms || []).map(s => ({ ...s, IsSandbox: true, SavedByAccountId: id, MaxPlayers: Math.max(Number(s.MaxPlayers) || 1, 4) }));
    out.Scenes = (out.Scenes || []).map(s => ({ ...s, IsSandbox: true, MaxPlayers: Math.max(Number(s.MaxPlayers) || 1, 4) }));
    return out;
}

function wrap(req, res, next) {
    const id = me(req);
    if (!id) return next();
    const orig = res.json.bind(res);
    res.json = (body) => {
        try {
            if (Array.isArray(body)) {
                body = body.map(r => personalise(r, id));
                if (body.some(r => r && Number(r.RoomId) === DORM_ID)) console.log(`[hydrium-DORM] dorm personalised for ${id} (bulk)`);
            } else if (body && Number(body.RoomId) === DORM_ID) {
                body = personalise(body, id);
                console.log(`[hydrium-DORM] dorm personalised for ${id}`);
            }
        } catch (e) { console.log("[hydrium-DORM] error", e.message); }
        return orig(body);
    };
    next();
}

router.get("/rooms/bulk", wrap);
router.post("/rooms/bulk", wrap);
router.get("/rooms/:roomId", (req, res, next) => Number(req.params.roomId) === DORM_ID ? wrap(req, res, next) : next());

module.exports = { router, personalise };
