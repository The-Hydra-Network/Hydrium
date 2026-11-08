"use strict";
// Hydrium - quiet fixes for requests the game makes that used to end in a 404 (see your log):
//   DELETE /rooms/:id/leaderboards/:n   the game deletes leaderboard slots blindly when it tears a room down
//   GET    /api/testcasemanagement/*    QA calls from the client
//   POST   /api/freegifts/v1/sendmultiple   "send a gift to friends"
//   GET    /favicon.ico
// Mount it LAST (after your other modules): it only answers what nothing else did.
//   app.use(require("./hydrium-fixes5").router);

const express = require("express");
const router = express.Router();
const json = express.json({ type: () => true, limit: "1mb" });

router.delete(/^\/rooms\/\d+\/leaderboards\/\d+$/, (req, res) => res.json({ Success: false, Error: "", error_id: null })); // "nothing to remove" is what the game expects
router.get("/api/testcasemanagement/v1/testplans", (req, res) => res.json([]));
router.get("/api/testcasemanagement/v1/testpasssummary", (req, res) => res.json({}));
// Friend-O-Tron: the player picks friends and sends each one a free gift box (GiftContext 1300).
// The box holds FRIENDOTRON_TOKENS tokens (default 50); set FRIENDOTRON_TOKENS=0 to send an empty box note only.
const jwt = require("jsonwebtoken");
const whoAmI = (req) => { const h = String(req.headers.authorization || ""); if (!/^Bearer /i.test(h)) return null; try { const n = Number(jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET).sub); return Number.isSafeInteger(n) && n > 0 ? n : null; } catch { return null; } };
const sentToday = new Map(); // "from:to:day" -> true, one gift per friend per day
router.post("/api/freegifts/v1/sendmultiple", json, (req, res) => {
    const me = whoAmI(req), b = req.body || {};
    if (!me) return res.status(401).json({ success: false, error: "Unauthorized", value: null });
    const to = [...new Set((Array.isArray(b.ToPlayerIds) ? b.ToPlayerIds : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0 && n !== me))].slice(0, 50);
    const tokens = Math.max(0, Number(process.env.FRIENDOTRON_TOKENS ?? 50) || 0), day = new Date().toISOString().slice(0, 10), sent = [];
    let econ = null; try { econ = require("./hydrium-econ-buy"); } catch { /* econ module not found */ }
    for (const t of to) {
        const k = `${me}:${t}:${day}`; if (sentToday.has(k)) continue; sentToday.set(k, true);
        if (econ && econ.giveTokenGift) { econ.giveTokenGift(t, me, tokens, typeof b.Message === "string" ? b.Message.slice(0, 256) : null, Number(b.GiftContext) || 1300); sent.push(t); }
    }
    console.log(`[FIXES5] Friend-O-Tron: ${me} -> ${sent.join(",") || "nobody"} (${tokens} tokens each)`);
    res.json({ success: true, error: "", value: null });
});
router.get("/favicon.ico", (req, res) => res.status(204).end());

module.exports = { router };