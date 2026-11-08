// Ruoli (developer, moderator...) per Hydrium.
// - roleClaim(): costruisce il claim "role" del token a partire dal campo `role` dell'account
// - router: risponde a /role/<ruolo>/<id> e /role/<ruolo>?id=.. come fa il server vero
const express = require("express");
const pb = require("./pb");

const KNOWN = ["developer", "moderator", "influencer", "betastudio"];

// "admin" e' un'abbreviazione: developer + moderator.
function parseRoles(value) {
    const out = new Set();
    for (const raw of String(value || "").split(/[,\s]+/)) {
        const r = raw.trim().toLowerCase();
        if (!r) continue;
        if (r === "admin") { out.add("developer"); out.add("moderator"); }
        else if (KNOWN.includes(r)) out.add(r);
    }
    return [...out];
}

// Chi non ha ruoli speciali tiene il claim di prima (la stringa "user"):
// nessun cambiamento per i giocatori normali.
function roleClaim(value) {
    const extras = parseRoles(value);
    if (extras.length === 0) return value || "user";
    return ["screenshare", ...extras];
}

const router = express.Router();
const COLLECTION = "hydrium_accounts";

async function rolesOf(accountId) {
    const rec = await pb.collection(COLLECTION).getFirstListItem(`accountId = ${Number(accountId)}`);
    return parseRoles(rec.role);
}

// GET /role/developer/123  ->  true | false  (404 se l'account non esiste)
router.get("/role/:role/:id", async (req, res) => {
    const role = String(req.params.role).toLowerCase();
    const id = Number(req.params.id);
    if (!KNOWN.includes(role) || !Number.isSafeInteger(id)) return res.status(404).end();
    try {
        const roles = await rolesOf(id);
        return res.status(200).json(roles.includes(role));
    } catch (err) {
        if (err.status === 404) return res.status(404).end();
        console.error("[ROLES] errore:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// GET /role/developer?id=2&id=3  ->  [2]   (quali tra quelli hanno il ruolo)
router.get("/role/:role", async (req, res) => {
    const role = String(req.params.role).toLowerCase();
    if (!KNOWN.includes(role)) return res.status(404).end();
    const ids = [].concat(req.query.id || []).map(Number).filter(Number.isSafeInteger);
    const out = [];
    for (const id of ids) {
        try { if ((await rolesOf(id)).includes(role)) out.push(id); } catch (_) {}
    }
    return res.status(200).json(out);
});

module.exports = { router, roleClaim, parseRoles, KNOWN };
