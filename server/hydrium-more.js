"use strict";

// Hydrium - assorted endpoints the game asks for, shapes from RecFlare.
//   rooms:     GET /rooms/:id/interactionby/me, PUT|DELETE .../cheer and .../favorite (saved),
//              GET /rooms/contributedby/me, /rooms/base, /rooms/requiring/developer|rrplus  -> []
//   commerce:  GET|POST /purchase/v1/cleanuppending, GET /reminder/currentTokenBundles/v2,
//              GET /purchasecampaign/allcurrent/v2                                          -> []
//   images:    GET|POST /api/images/v5/cheered/bulk, GET /api/images/v1/slideshow
//   store:     GET /api/storefronts/v1/adcarouselitems, GET /api/customAvatarItems/v1/hot
//   clubs:     GET /club/search, GET /club/mine/created
//   more:      rooms similar/experience, sanitize isPure, hasspentmoney, verifyRole, mutualfriends, outfits/bulk,
//              inventions/v1/room, subscriberCount, receives/GameplayInvites
// Room cheers/favourites are kept in data/room-interactions.json (override ROOM_INTERACTIONS_FILE).
//
// Mount in index.js before app.use(auth), e.g. after the hydrium-rooms line:
//   app.use(require("./hydrium-more").router);

const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const router = express.Router();
const FILE = path.resolve(process.env.ROOM_INTERACTIONS_FILE || path.join(__dirname, "data", "room-interactions.json"));

let store = {}; // store["<account>:<room>"] = { cheered, favorited }
try {
    store = JSON.parse(fs.readFileSync(FILE, "utf8")) || {};
} catch {
    /* first run */
}
function persist() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(store, null, 2));
    fs.renameSync(FILE + ".tmp", FILE);
}

function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const n = Number(jwt.verify(h.slice(7).trim(), process.env.HYDRIUM_JWT_SECRET || "hydrium-development-secret").sub);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

const empty = (...paths) => {
    for (const p of paths) router.all(p, (req, res, next) => (req.method === "GET" || req.method === "POST" ? res.status(200).json([]) : next()));
};

// ---------- rooms ----------

const view = (me, room) => {
    const r = store[`${me}:${room}`] || {};
    return { Cheered: !!r.cheered, Favorited: !!r.favorited, LastVisitedAt: new Date().toISOString() };
};
function change(flag, mode) {
    return (req, res) => {
        const me = accountId(req);
        if (!me) return res.status(401).end();
        const room = Number.parseInt(req.params.roomId, 10);
        if (!Number.isSafeInteger(room)) return res.status(400).end();
        const k = `${me}:${room}`;
        const r = (store[k] ||= {});
        r[flag] = mode === "toggle" ? !r[flag] : false;
        if (!r.cheered && !r.favorited) delete store[k];
        persist();
        res.status(200).json(view(me, room));
    };
}
router.get("/rooms/:roomId/interactionby/me", (req, res, next) => {
    if (!/^\d+$/.test(req.params.roomId)) return next();
    const me = accountId(req);
    if (!me) return res.status(401).end();
    res.status(200).json(view(me, Number(req.params.roomId)));
});
router.put("/rooms/:roomId/interactionby/me/cheer", change("cheered", "toggle"));
router.delete("/rooms/:roomId/interactionby/me/cheer", change("cheered", "clear"));
router.put("/rooms/:roomId/interactionby/me/favorite", change("favorited", "toggle"));
router.delete("/rooms/:roomId/interactionby/me/favorite", change("favorited", "clear"));

empty("/rooms/contributedby/me", "/rooms/base", "/rooms/requiring/developer", "/rooms/requiring/rrplus");

// ---------- commerce ----------

empty("/purchase/v1/cleanuppending", "/reminder/currentTokenBundles/v2", "/purchasecampaign/allcurrent/v2");

// ---------- images ----------

function cheeredLookup(req, res) {
    if (!accountId(req)) return res.status(401).end();
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const key = Object.keys(b).find((k) => k.toLowerCase() === "id");
    const raw = [req.query.id, key ? b[key] : undefined].flat().filter((v) => v !== undefined).map(String);
    const ids = raw.flatMap((v) => v.split(",")).map((v) => Number.parseInt(v.trim(), 10)).filter((n) => !Number.isNaN(n));
    res.status(200).json(ids.map((id) => ({ SavedImageId: id, IsCheered: false })));
}
router.get("/api/images/v5/cheered/bulk", cheeredLookup);
router.post("/api/images/v5/cheered/bulk", express.urlencoded({ extended: true }), express.json({ type: () => true, limit: "50kb" }), cheeredLookup);

router.get("/api/images/v1/slideshow", (req, res) => {
    res.status(200).json({ Images: [], ValidTill: new Date(Date.now() + 2 * 60 * 1000).toISOString() });
});

// ---------- store ----------

router.get("/api/storefronts/v1/adcarouselitems", (req, res) => {
    res.status(200).json([{ AdCarouselItemId: 1, Description: "No description.", ImageName: "AdCarouselItem.png", PurchasableItemIds: [], Title: "Lorem ipsum" }]);
});
router.get("/api/customAvatarItems/v1/hot", (req, res) => res.status(200).json([]));

// ---------- clubs ----------

router.get("/club/search", (req, res) => res.status(200).json({ Clubs: [], ContinuationToken: null, TotalClubs: 0 }));
router.get("/club/mine/created", (req, res) => res.status(200).json([]));

// ---------- more (from the 13:03 log) ----------

router.get("/rooms/:roomId/similar", (req, res, next) => (/^\d+$/.test(req.params.roomId) ? res.status(200).json({ Results: [], TotalResults: 0 }) : next()));
router.get("/rooms/:roomId/experience", (req, res, next) => (/^\d+$/.test(req.params.roomId) ? res.status(200).json({ Enabled: false, DailyLimit: 0 }) : next()));
router.post("/api/sanitize/v1/isPure", (req, res) => res.status(200).json({ IsPure: true }));
router.get("/purchase/v1/hasspentmoney", (req, res) => res.status(200).json(false));
router.get("/api/inventions/v1/room", (req, res) => (/^\d+$/.test(String(req.query.id || "")) ? res.status(200).json([]) : res.status(400).json({ error: "id is required" })));
router.get("/subscription/subscriberCount/:accountId", (req, res, next) => (/^\d+$/.test(req.params.accountId) ? res.status(200).json(0) : next()));
router.get("/accounts/:id/receives/GameplayInvites", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    if (!accountId(req)) return res.status(401).end();
    res.status(200).json(true);
});
// the worn outfit of each account; accounts with no saved outfit are left out of the map
router.post("/outfits/bulk", express.json({ type: () => true, limit: "100kb" }), (req, res) => {
    if (!accountId(req)) return res.status(401).end();
    const ids = req.body && Array.isArray(req.body.AccountIds) ? req.body.AccountIds : null;
    if (ids === null) return res.status(400).json({ error: "Invalid request body" });
    if (new Set(ids).size > 99) return res.status(400).json({ error: "At most 99 accounts per request" });
    res.status(200).json({ OutfitsByAccountId: {} });
});

// does the caller hold at least this role in the room? (RecCenter's roles come from reccenter-roles.json)
router.post("/api/rooms/v1/verifyRole", express.urlencoded({ extended: true }), express.json({ type: () => true, limit: "20kb" }), (req, res) => {
    const me = accountId(req);
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const roomId = Number.parseInt(String(b.roomId ?? req.query.roomId ?? ""), 10);
    const role = Number.parseInt(String(b.role ?? req.query.role ?? ""), 10);
    if (!me || Number.isNaN(roomId) || roomId !== 2) return res.status(200).json(false);
    try {
        const roles = JSON.parse(fs.readFileSync(path.join(__dirname, "reccenter-roles.json"), "utf8"));
        const held = Number(roles.creator) === me ? 255 : (roles.coOwners || []).map(Number).includes(me) ? 30 : 0;
        res.status(200).json(held > 0 && held >= (Number.isNaN(role) ? 0 : role));
    } catch {
        res.status(200).json(false);
    }
});

// friends both players have, with their names (needs hydrium-friends + PocketBase)
router.get("/api/relationships/mutualfriends", async (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).end();
    const other = Number.parseInt(String(req.query.id || ""), 10);
    if (!Number.isSafeInteger(other) || other <= 0 || other === me) return res.status(200).json([]);
    try {
        const { list } = require("./hydrium-friends");
        const friends = (id) => new Set(list(id).filter((r) => r.RelationshipType === 3).map((r) => r.PlayerID));
        const mine = friends(me);
        const shared = [...friends(other)].filter((id) => mine.has(id)).sort((a, b) => a - b).slice(0, 50);
        const pb = require("./pb");
        const out = [];
        for (const id of shared) {
            try {
                const r = await pb.collection(pb.hydriumCollections.accounts).getFirstListItem(`accountId = ${id}`);
                out.push({ AccountId: id, Username: r.username || "", DisplayName: r.displayName || r.username || "", ProfileImage: r.profileImage || "DefaultProfileImage.jpg" });
            } catch {
                /* account gone */
            }
        }
        res.status(200).json(out);
    } catch {
        res.status(200).json([]);
    }
});

module.exports = { router };
