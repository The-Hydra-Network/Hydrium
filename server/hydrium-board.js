// Hydrium - Community Board for Hydrium (same format as RecFlare).
// Reads community-board.json on every request, so edits take effect without restarting.
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const FILE = path.join(__dirname, "community-board.json");
const FALLBACK = {
    FeaturedPlayer: { Id: 1, TitleOverride: "", UrlOverride: null },
    FeaturedRoomGroup: { FeaturedRoomGroupId: 2, Name: "Featured Rooms", Rooms: [] },
    CurrentAnnouncement: { Message: "Welcome to Hydrium!", MoreInfoUrl: "" },
    InstagramImages: [],
    Videos: []
};

router.get("/api/communityboard/v2/current", (req, res) => {
    let board = FALLBACK;
    try { board = JSON.parse(fs.readFileSync(FILE, "utf8")); }
    catch (e) { console.log("[hydrium-BOARD] Could not read community-board.json; using the default:", e.message); }
    console.log("[hydrium-BOARD] Community board served");
    res.status(200).json(board);
});

module.exports = { router };
