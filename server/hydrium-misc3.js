"use strict";

// Hydrium - challenges/objectives, the discovery lists and the store's "add tokens" lookups.
//   GET  /api/objectives/v1/myprogress     RecFlare's bundled progress (needs my-progress.json beside this file)
//   POST /api/objectives/v1/updateobjective  echoes { group, isCompleted:false } like RecFlare
//   GET  /algorithmiclists/:list           { Type, Entities:[{Id,Context}] } - HotList etc. fill with the RRO rooms
//   GET  /api/storefronts/v1/balanceAddType/:a/:b   empty list (no way to buy tokens here)
// Mount before app.use(auth) and before the old routers:  app.use(require("./hydrium-misc3").router);

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

let progress = { Objectives: [], ObjectiveGroups: [] };
try { progress = JSON.parse(fs.readFileSync(path.join(__dirname, "my-progress.json"), "utf8")); } catch { /* keep empty */ }

router.get("/api/objectives/v1/myprogress", (req, res) => res.status(200).json(progress));

router.post("/api/objectives/v1/updateobjective", express.json({ type: () => true }), (req, res) => {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    res.status(200).json({ group: Number(b.Group) || 0, isCompleted: false });
});

let roomIds = null;
function rooms() {
    if (roomIds) return roomIds;
    roomIds = ["2"];
    for (const f of [path.join(__dirname, "roomdata", "rro-rooms.json")]) {
        try { for (const r of JSON.parse(fs.readFileSync(f, "utf8"))) if (r.RoomId > 2) roomIds.push(String(r.RoomId)); } catch { /* none */ }
    }
    return roomIds;
}

// RecFlare: HotList / new / recentlyupdated and the room rows are ranked room ids; any other row is
// an empty 200 (a 404 renders as a failed row).
const ROOM_ROWS = new Set(["hotlist", "recentlyupdated", "new"]);
router.get("/algorithmiclists/:list", (req, res) => {
    const key = String(req.params.list).toLowerCase();
    const type = Number.parseInt(req.query.type, 10);
    const echoed = Number.isNaN(type) ? 1 : type;
    const ids = ROOM_ROWS.has(key) || key.endsWith("_algoendpoint") ? rooms().slice(0, 20) : [];
    console.log(`[LISTS] algorithmiclist ${req.params.list}: ${ids.length} entities`);
    res.status(200).json({ Type: echoed, Entities: ids.map((Id) => ({ Id, Context: null })) });
});

router.get("/api/storefronts/v1/balanceAddType/:a/:b", (req, res) => res.status(200).json([]));

module.exports = { router };
