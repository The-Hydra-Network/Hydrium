"use strict";

// Hydrium - player events and inventions browse screens, shapes taken from RecFlare (apps/api/src/routes/events.ts).
// No events are stored yet, so every list is empty, but each endpoint has the exact shape the
// client decodes (bare array vs { ContinuationToken, Events } vs { Created, Responses }).
//
// Mount in index.js before app.use(api) (e.g. after the hydrium-rooms line):
//   app.use(require("./hydrium-events").router);

const express = require("express");
const router = express.Router();

const log = (req) => console.log(`[EVENTS] ${req.method} ${req.path}`);

// Filter chips on the browse screen (static in RecFlare; TrendingFilters stays null)
const FILTERS = ["workshops", "celebration", "game", "meetup", "performance", "coop", "grandopening", "class", "competition"];
router.get("/api/playerevents/v1/tagfilters", (req, res) => {
    log(req);
    res.status(200).json({
        PinnedFilters: FILTERS,
        PopularFilters: ["workshops", "celebration", "class", "coop", "competition", "game", "grandopening", "meetup", "performance"],
        TrendingFilters: null,
    });
});

// Bare arrays: browse feed, a room's shelf, several clubs' shelf, live events, search
for (const p of ["/api/playerevents/v1", "/api/playerevents/v1/room/:roomId", "/api/playerevents/v1/clubs", "/api/playerevents/v1/searchlive", "/api/playerevents/v1/search"]) {
    router.get(p, (req, res) => {
        log(req);
        res.status(200).json([]);
    });
}

// One club's shelf is the odd one out: paged envelope (RecFlare warns not to unify these)
router.get("/api/playerevents/v1/club/:clubId", (req, res) => {
    log(req);
    res.status(200).json({ ContinuationToken: "", Events: [] });
});

// Another player's events on their profile
router.get("/api/playerevents/v1/all/:playerId", (req, res) => {
    log(req);
    res.status(200).json({ Created: [], Responses: [] });
});

// ---------- inventions browse (RecFlare apps/api/src/routes/avatar.ts) ----------
// Nothing is published on Hydrium yet: empty bare arrays, and empty filter chips.
for (const p of ["/api/inventions/v1/fromcreators", "/api/inventions/v1/toptoday", "/api/inventions/v1/featured", "/api/inventions/v1/featureddormskins", "/api/inventions/v2/search", "/api/inventions/v2/mine"]) {
    router.get(p, (req, res) => {
        log(req);
        res.status(200).json([]);
    });
}
router.get("/api/inventions/v1/tagfilters", (req, res) => {
    log(req);
    res.status(200).json({ PinnedFilters: [], PopularFilters: [], TrendingFilters: null });
});

module.exports = { router };
