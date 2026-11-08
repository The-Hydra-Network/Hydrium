"use strict";
// Hydrium - reputation: every player is "cheerful" (IsCheerful: true), like the reference server serves.
// With IsCheerful false the game thinks you have "too many moderation incidents" and refuses to let you create a club.
// MOUNT IT EARLY (before the module that answers /api/playerReputation), e.g. right after your body parsers:
//   app.use(require("./hydrium-rep").router);
const express = require("express");
const router = express.Router();
const fix = (b) => (Array.isArray(b) ? b.map(fix) : b && typeof b === "object" && "AccountId" in b && "IsCheerful" in b ? { ...b, IsCheerful: true } : b);
router.use("/api/playerReputation", (req, res, next) => { const j = res.json.bind(res); res.json = (b) => j(fix(b)); next(); });
module.exports = { router, fix };