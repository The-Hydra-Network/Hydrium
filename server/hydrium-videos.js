"use strict";

// Hydrium - the Videos service (videos-hydrium.hydranet.dpdns.org), used by the Remote Video Player.
//
// RecFlare has no route for this host and the real request shape is not documented, so this module
// does two things:
//   1. LOGS every request that reaches the videos host in full ([VIDEOS] lines: method, path, query,
//      headers that matter, body), so the log shows exactly what the game asks for.
//   2. ANSWERS as best it can: when a request carries a video URL (query or body field
//      url / videoUrl / videoURL / source / link), it replies that the URL is allowed and playable and
//      hands the same URL back for the player to stream. Anything else gets an empty 200 JSON
//      object so the game is not blocked on a 404.
//
// Send me the [VIDEOS] lines after you try a video and I will replace the guess with the exact shape.
//
// Mount it before app.use(auth) and before the 404 handler:
//   app.use(require("./hydrium-videos").router);
// It only handles requests whose Host starts with "videos" (or "video"), or whose path starts with /video(s).

const express = require("express");

const router = express.Router();

const isVideos = (req) => /^videos?[.-]/i.test(String(req.headers.host || "")) || /^\/videos?(\/|$)/i.test(req.path);

router.use((req, res, next) => {
    if (!isVideos(req)) return next();
    express.json({ type: () => true, limit: "1mb" })(req, res, () => {
        express.urlencoded({ extended: true })(req, res, () => {
            const keep = ["authorization", "content-type", "user-agent", "origin", "referer", "range"];
            const h = {};
            for (const k of keep) if (req.headers[k]) h[k] = k === "authorization" ? "[hidden]" : req.headers[k];
            console.log(`[VIDEOS] ${req.method} ${req.originalUrl} host=${req.headers.host}`);
            console.log(`[VIDEOS]   headers=${JSON.stringify(h)}`);
            if (req.body && Object.keys(req.body).length) console.log(`[VIDEOS]   body=${JSON.stringify(req.body).slice(0, 1500)}`);

            const pick = (o) => {
                if (!o || typeof o !== "object") return null;
                for (const k of Object.keys(o)) {
                    if (/^(url|videourl|source|link|uri)$/i.test(k) && typeof o[k] === "string" && o[k]) return o[k];
                }
                return null;
            };
            const url = pick(req.query) || pick(req.body);
            if (!url) {
                console.log("[VIDEOS]   no url in request -> {} (tell me what the game does next)");
                return res.status(200).json({});
            }
            console.log(`[VIDEOS]   url=${url} -> allowed, returned as-is`);
            res.status(200).json({
                success: true, Success: true, error: null, Error: null,
                IsValid: true, Valid: true, Allowed: true, IsAllowed: true,
                Url: url, url, VideoUrl: url, PlaybackUrl: url, ResolvedUrl: url, StreamUrl: url,
                value: { Url: url, IsValid: true, Allowed: true, PlaybackUrl: url },
            });
        });
    });
});

module.exports = { router };
