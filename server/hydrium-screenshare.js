"use strict";

// Hydrium - /role/screenshare/:id  (and /role/screenshare?id=1&id=2)
//
// RecFlare: "Studio queries each room owner's screenshare role before validating video players."
// hydrium-roles.js only knows developer/moderator/influencer/betastudio, so the game's
// screenshare lookup got a 404 and the Remote Video Player rejected URLs.
// Same rule as the token: an account with any special role has screenshare.
// Answers like the other roles: bare true/false (404 for an unknown account).
//
// Mount BEFORE hydrium-roles in index.js:
//   app.use(require("./hydrium-screenshare").router);
//   app.use(require("./hydrium-roles").router);

const express = require("express");
const pb = require("./pb");
const { parseRoles } = require("./hydrium-roles");

const router = express.Router();

async function has(id) {
    const rec = await pb.collection("hydrium_accounts").getFirstListItem(`accountId = ${Number(id)}`);
    return parseRoles(rec.role).length > 0;
}

router.get("/role/screenshare/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id)) return res.status(404).end();
    try {
        const v = await has(id);
        console.log(`[ROLES] screenshare ${id}: ${v}`);
        res.status(200).json(v);
    } catch {
        res.status(404).end();
    }
});

router.get("/role/screenshare", async (req, res) => {
    const ids = [].concat(req.query.id || []).map(Number).filter(Number.isSafeInteger);
    const out = [];
    for (const id of ids) { try { if (await has(id)) out.push(id); } catch { /* unknown */ } }
    res.status(200).json(out);
});

module.exports = { router };
