"use strict";

// Hydrium - loading screen tips.
//
// Your log shows GET /config/LoadingScreenTipData answering [] every time, so the loading screen
// had no tips. The old handler looked for blobs/loading-tips.json, but the file shipped in
// blobs/loading-tips/loading-tips.json, so it was never found.
//
// This serves, in order:
//   1. blobs/loading-tips.json
//   2. blobs/loading-tips/loading-tips.json      (your own Hydrium tips)
//   3. loading-screen-tip-data.json next to this file (RecFlare's captured original tips)
// and copies the tip pictures (blobs/loading-tips/*.png|jpg) into static/ at startup so the image
// server can serve them by the ImageName the tips use (tip1.png ...).
//
// Mount before app.use(api):  app.use(require("./hydrium-loading").router);

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const BLOBS = path.join(__dirname, "blobs");
const STATIC = path.resolve(process.env.IMG_STATIC_DIR || path.join(__dirname, "static"));

function readTips() {
    const files = [
        path.join(BLOBS, "loading-tips.json"),
        path.join(BLOBS, "loading-tips", "loading-tips.json"),
        path.join(__dirname, "loading-screen-tip-data.json"),
    ];
    for (const f of files) {
        try {
            const j = JSON.parse(fs.readFileSync(f, "utf8"));
            if (Array.isArray(j) && j.length) return { tips: j, from: f };
        } catch { /* try next */ }
    }
    return { tips: [], from: null };
}

try {
    fs.mkdirSync(STATIC, { recursive: true });
    const dir = path.join(BLOBS, "loading-tips");
    for (const f of fs.readdirSync(dir)) {
        if (!/\.(png|jpe?g)$/i.test(f)) continue;
        const to = path.join(STATIC, f);
        if (!fs.existsSync(to)) { fs.copyFileSync(path.join(dir, f), to); console.log(`[LOADING] copied tip picture ${f} -> static/`); }
    }
} catch { /* no tip pictures folder */ }

try { // RecFlare's original tips all use tip.jpg
    const to = path.join(STATIC, "tip.jpg");
    if (!fs.existsSync(to) && fs.existsSync(path.join(__dirname, "tip.jpg"))) { fs.mkdirSync(STATIC, { recursive: true }); fs.copyFileSync(path.join(__dirname, "tip.jpg"), to); }
} catch { /* ignore */ }

router.get("/config/LoadingScreenTipData", (req, res) => {
    const { tips, from } = readTips();
    console.log(`[LOADING] ${tips.length} tip(s) from ${from || "nowhere (no tip file found)"}`);
    res.set("Cache-Control", "no-cache");
    res.status(200).json(tips);
});

module.exports = { router };
