"use strict";

// Hydrium - item wishlists and objectives clear-group, shapes from RecFlare (apps/econ).
//   GET        /api/itemWishlists/v1/wishlist/me         bare array, newest first
//   GET        /api/itemWishlists/v1/wishlist/:accountId
//   POST       /api/itemWishlists/v1/wishlist/add | remove   { Value, Success, Error, error_id }
//   POST       /api/itemWishlists/v1/isonwishlist/bulk       bare array of booleans
//   GET|POST   /api/objectives/v1/cleargroup                 []
// Wishlists are kept in data/wishlists.json (override WISHLIST_FILE).
//
// Mount in index.js before app.use(auth), e.g. after the hydrium-rooms line:
//   app.use(require("./hydrium-econ-extras").router);

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const router = express.Router();
const FILE = path.resolve(process.env.WISHLIST_FILE || path.join(__dirname, "data", "wishlists.json"));
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_ITEM = "No item was specified.";

let lists = {}; // lists[accountId] = [{ WishlistItemId, AccountId, PurchasableItemId, CustomAvatarItemId, CreatedAt }]
try {
    lists = JSON.parse(fs.readFileSync(FILE, "utf8")) || {};
} catch {
    /* first run */
}
function persist() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(lists, null, 2));
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

const body = [express.urlencoded({ extended: true }), express.json({ type: () => true, limit: "50kb" })];
const parse = (req, res, next) => body[0](req, res, (e) => (e ? next(e) : body[1](req, res, next)));

// the field from the body (any case), first value if repeated
function field(req, name) {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const k = Object.keys(b).find((x) => x.toLowerCase() === name.toLowerCase());
    const v = k !== undefined ? b[k] : undefined;
    return Array.isArray(v) ? v[0] : v;
}
function target(req) {
    const str = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
    const id = str(field(req, "purchasableItemId"));
    if (/^\d+$/.test(id) && Number(id) > 0) return { p: Number(id), c: null };
    const guid = str(field(req, "customAvatarItemId"));
    if (GUID.test(guid)) return { p: 0, c: guid.toLowerCase() };
    return null;
}
const same = (e, t) => (t.c ? e.CustomAvatarItemId === t.c : e.PurchasableItemId === t.p && !e.CustomAvatarItemId);
const envelope = (res, value, error) => res.status(200).json({ Value: value, Success: error === undefined, Error: error ?? null, error_id: null });
const newestFirst = (id) => [...(lists[id] || [])].reverse();

router.get("/api/itemWishlists/v1/wishlist/me", (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).end();
    res.status(200).json(newestFirst(me));
});

router.get("/api/itemWishlists/v1/wishlist/:accountId", (req, res, next) => {
    if (!/^\d+$/.test(req.params.accountId)) return next();
    if (!accountId(req)) return res.status(401).end();
    res.status(200).json(newestFirst(Number(req.params.accountId)));
});

router.post("/api/itemWishlists/v1/wishlist/add", parse, (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).end();
    const t = target(req);
    if (!t) return envelope(res, null, NO_ITEM);
    const list = (lists[me] ||= []);
    let entry = list.find((e) => same(e, t));
    if (!entry) {
        entry = { WishlistItemId: crypto.randomUUID(), AccountId: me, PurchasableItemId: t.p, CustomAvatarItemId: t.c, CreatedAt: new Date().toISOString() };
        list.push(entry);
        persist();
    }
    console.log(`[WISHLIST] ${me} added ${t.c || t.p}`);
    envelope(res, entry);
});

router.post("/api/itemWishlists/v1/wishlist/remove", parse, (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).end();
    const t = target(req);
    if (!t) return envelope(res, null, NO_ITEM);
    const list = lists[me] || [];
    const i = list.findIndex((e) => same(e, t));
    const removed = i >= 0 ? list.splice(i, 1)[0] : null;
    if (removed) persist();
    console.log(`[WISHLIST] ${me} removed ${t.c || t.p}`);
    envelope(res, removed);
});

router.post("/api/itemWishlists/v1/isonwishlist/bulk", parse, (req, res) => {
    if (!accountId(req)) return res.status(401).end();
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const raw = [b.accountIds, b.AccountIds].flat().filter((v) => v !== undefined).map(String);
    const ids = raw.flatMap((v) => v.split(",")).map((v) => Number.parseInt(v.trim(), 10)).filter(Number.isInteger);
    const t = target(req);
    res.status(200).json(ids.map((id) => !!t && (lists[id] || []).some((e) => same(e, t))));
});

// No per-player objective progress yet: nothing to clear (a 404 here breaks the client)
router.all("/api/objectives/v1/cleargroup", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "POST") return next();
    res.status(200).json([]);
});

module.exports = { router };
