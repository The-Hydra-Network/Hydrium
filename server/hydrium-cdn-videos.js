"use strict";

// Hydrium - serves videos for the Remote Video Player from the CDN host.
//
// Rec Room's own devs uploaded videos to the game's CDN and pasted that CDN link into the player.
// The player most likely only accepts links on the CDN base the server announces in /api/config/v2
// ("CdnBaseUri": https://cdn-hydrium.hydranet.dpdns.org/). Your earlier test used a different host
// (cdn.hydranet.dpdns.org), which the game may refuse before it ever makes a request.
//
// Put video files in  C:/Server/Hydrium/static/videos/  (env VIDEOS_DIR changes it), then in the player use:
//     just the file name, e.g.  Test.mp4   (the game adds /video/ itself and asks the CDN host)
//
// Range requests (seeking) and HEAD work. Use H.264/AAC .mp4 - .mkv is unlikely to play.
// Mount before app.use(auth):  app.use(require("./hydrium-cdn-videos").router);

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const DIR = path.resolve(process.env.VIDEOS_DIR || path.join(__dirname, "static", "videos"));
fs.mkdirSync(DIR, { recursive: true });

const TYPES = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "cquicktime", ".mkv": "video/x-matroska", ".m3u8": "application/vnd.apple.mpegurl", ".ts": "video/mp2t" };

// What the game really does (seen in the logs): it takes the text you type into the player's "Video Url"
// and requests  <cdn>/video/ + that text  with the Windows media player (NSPlayer).
// So typing  Test.mp4  fetches /video/Test.mp4, and typing /Videos/Test.mp4 fetches /video//Videos/Test.mp4.
// Any of these work here: leading slashes, a repeated video/videos folder and capital letters are ignored,
// so the file is simply found by its name in the videos folder.
function findFile(rawPath) {
    let p;
    try { p = decodeURIComponent(rawPath); } catch { p = rawPath; }
    const parts = p.split("/").filter((x) => x && x !== "." && x !== "..");
    while (parts.length && /^videos?$/i.test(parts[0])) parts.shift();
    const name = parts.length ? parts[parts.length - 1] : "";
    if (!name) return null;
    // every file under the videos folder (subfolders too)
    const all = [];
    (function walk(d, depth) {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.isDirectory()) { if (depth < 4) walk(path.join(d, e.name), depth + 1); }
            else all.push(path.join(d, e.name));
        }
    })(DIR, 0);
    const low = name.toLowerCase();
    const stem = (f) => path.basename(f).toLowerCase().replace(/(\.[a-z0-9]{2,4})+$/, "");
    const want = low.replace(/(\.[a-z0-9]{2,4})+$/, "");
    // 1 exact name, 2 case-insensitive, 3 same name ignoring extensions (finds "succubus.mp4.mp4"), 4 same stem
    const hit = all.find((f) => path.basename(f) === name)
        || all.find((f) => path.basename(f).toLowerCase() === low)
        || all.find((f) => path.basename(f).toLowerCase().startsWith(low))
        || all.find((f) => stem(f) === want);
    if (!hit) console.log(`[VIDEOS] files I can see in ${DIR}: ${all.map((f) => path.relative(DIR, f)).join(", ") || "(none)"}`);
    return hit || null;
}

router.all(/^\/videos?\/.+/, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") return next();
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Range");
    res.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
    if (req.method === "OPTIONS") return res.status(204).end();
    const file = findFile(req.path);
    if (!file) {
        console.log(`[VIDEOS] ${req.method} ${req.path} -> no such file in ${DIR}`);
        return res.status(404).end();
    }
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    console.log(`[VIDEOS] ${req.method} ${req.path} -> ${path.basename(file)} (${type}) range=${req.headers.range || "-"} ua=${String(req.headers["user-agent"] || "").slice(0, 30)}`);
    res.set("Content-Type", type);
    res.set("Cache-Control", "public, max-age=3600");
    res.sendFile(file, { headers: { "Content-Type": type }, acceptRanges: true }, (e) => {
        if (e && !res.headersSent) res.status(e.status || 500).end();
    });
});

console.log(`[VIDEOS] CDN videos folder: ${DIR}`);
module.exports = { router };
