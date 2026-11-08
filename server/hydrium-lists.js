"use strict";

// Hydrium - curated lists, shapes from RecFlare (apps/lists/src/lists.app.ts, curated-lists.ts).
//   GET /curatedlists?creatorAccountId=&type=&name=   ONE list object, never a 404 or {}
//   GET /curatedlists/bulk?id=                        a canned list (RecFlare does the same)
// Known page lists come from curated-lists.json (RecFlare's captures). Any other name gets an
// empty placeholder list echoing the name and type, which the client accepts as "nothing here".
// Reserved "__" playlists (e.g. __SavedForLater_Rooms) answer an empty list too.
// Player playlists are not stored yet, so "Saved for Later" always shows empty.
//
// Mount in index.js before app.use(lists) / the other routers, e.g. after the hydrium-rooms line:
//   app.use(require("./hydrium-lists").router);

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

let CURATED = [];
try {
    CURATED = JSON.parse(fs.readFileSync(path.join(__dirname, "curated-lists.json"), "utf8"));
} catch (err) {
    console.error("[LISTS+] curated-lists.json not loaded:", err.message);
}

const key = (n) => String(n ?? "").toLowerCase();
const byCreatorTypeName = new Map();
const byTypeName = new Map();
const byName = new Map();
const byType = new Map();
for (const l of CURATED) {
    const n = key(l.Name);
    byCreatorTypeName.set(`${l.CreatorAccountId}/${l.Type}/${n}`, l);
    if (!byTypeName.has(`${l.Type}/${n}`)) byTypeName.set(`${l.Type}/${n}`, l);
    if (!byName.has(n)) byName.set(n, l);
    if (!byType.has(l.Type)) byType.set(l.Type, l);
}

function resolve(creator, type, name) {
    const k = key(name);
    const t = Number.parseInt(type ?? "", 10);
    const hasType = Number.isInteger(t);
    const reserved = String(name ?? "").startsWith("__");
    return (
        (hasType ? byCreatorTypeName.get(`${creator}/${t}/${k}`) : undefined) ??
        (hasType ? byTypeName.get(`${t}/${k}`) : undefined) ??
        byName.get(k) ??
        (reserved ? { ListId: "0", CreatorAccountId: Number.parseInt(creator ?? "", 10) || 0, Name: String(name), Description: null, ImageName: "DefaultRoomImage.jpg", Type: hasType ? t : 0, ItemIds: [], Accessibility: 1, CreatedAt: new Date(0).toISOString() } : undefined) ??
        (k === "" && hasType ? byType.get(t) : undefined)
    );
}

function placeholder(creator, type, name) {
    const t = Number.parseInt(type ?? "", 10);
    return { ListId: "1", CreatorAccountId: Number.parseInt(creator ?? "", 10) || 0, Name: name ?? "", Description: null, ImageName: "DefaultListImage.jpg", Type: Number.isInteger(t) ? t : 0, ItemIds: [], Accessibility: 0, CreatedAt: "2026-08-24T18:44:52.438Z" };
}

// ListId is a string internally (ids exceed 2^53) and a NUMBER on the wire
const serialize = (list) => JSON.stringify(list).replace(/"ListId":"(\d+)"/, '"ListId":$1');

router.get("/curatedlists", (req, res) => {
    const { creatorAccountId, type, name } = req.query;
    const list = resolve(creatorAccountId, type, name) ?? placeholder(creatorAccountId, type, name);
    console.log(`[LISTS+] curatedlists ${name} (type ${type}) -> ${list.ItemIds.length} item(s)`);
    res.status(200).type("application/json").send(serialize(list));
});

router.get("/curatedlists/bulk", (req, res) => {
    res.status(200).json([{ ListId: 17859340, CreatorAccountId: 1, Name: "My List", Description: null, ImageName: "", Type: 1, ItemIds: ["123", "456"], CreatedAt: "2025-07-18T00:00:00Z" }]);
});

module.exports = { router };
