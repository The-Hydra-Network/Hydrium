"use strict";

// Hydrium - POST /actionlink on the Link service (link-hydrium...)
// The game asks for a shareable code (here: Type 0, valid 168 h, up to 20 uses),
// which is what the "invite a friend" / share-link buttons use.
// Codes are stored in data/actionlinks.json (override: ACTIONLINKS_FILE).
//
// Mount in index.js before app.use(auth):
//   app.use(require("./hydrium-link").router);

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const router = express.Router();
const FILE = path.resolve(process.env.ACTIONLINKS_FILE || path.join(__dirname, "data", "actionlinks.json"));
const BASE = String(process.env.ACTIONLINK_BASE || "https://rec.net/l/").replace(/\/?$/, "/");

let links = {};
try {
    links = JSON.parse(fs.readFileSync(FILE, "utf8")) || {};
} catch {
    /* first run */
}
function persist() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(links, null, 2));
    fs.renameSync(FILE + ".tmp", FILE);
}

function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const n = Number(jwt.verify(h.slice(7).trim(), process.env.HYDRIUM_JWT_SECRET || "hydrium-development-secret").sub);
        return Number.isSafeInteger(n) ? n : null;
    } catch {
        return null;
    }
}

const view = (l) => ({ Code: l.code, Url: BASE + l.code, Data: l.data, ValidHours: l.validHours, MaxCount: l.maxCount, CodeType: l.codeType, UseCount: l.used, CreatedByAccountId: l.by, ExpiresAt: l.expiresAt });
const num = (v, d, lo, hi) => Math.min(Math.max(Number.isFinite(Number(v)) && v !== "" && v != null ? Math.trunc(Number(v)) : d, lo), hi);

router.post("/actionlink", express.urlencoded({ extended: false }), express.json({ type: () => true, limit: "50kb" }), (req, res) => {
    const me = accountId(req);
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const validHours = num(b.validHours ?? b.ValidHours, 168, 1, 24 * 365);
    const link = {
        code: crypto.randomBytes(6).toString("base64url"),
        data: typeof b.data === "string" ? b.data.slice(0, 5000) : JSON.stringify(b.data ?? b.Data ?? {}),
        validHours,
        maxCount: num(b.maxCount ?? b.MaxCount, 20, 1, 100000),
        codeType: num(b.codeType ?? b.CodeType, 0, 0, 1000),
        used: 0,
        by: me,
        expiresAt: new Date(Date.now() + validHours * 3600e3).toISOString(),
    };
    links[link.code] = link;
    persist();
    console.log(`[LINK] actionlink ${link.code} created by ${me} (type ${link.codeType}, ${validHours}h, max ${link.maxCount})`);
    const v = view(link);
    res.status(200).json({ success: true, error: null, value: v, ...v });
});

router.get("/actionlink/:code", (req, res) => {
    const l = links[req.params.code];
    if (!l || Date.parse(l.expiresAt) < Date.now()) return res.status(404).json({ success: false, error: "Link not found or expired", value: null });
    const v = view(l);
    res.status(200).json({ success: true, error: null, value: v, ...v });
});

module.exports = { router };
