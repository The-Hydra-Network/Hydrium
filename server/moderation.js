const express = require("express");

const router = express.Router();

const MODERATION_HOST =
    "moderation-hydrium.hydranet.dpdns.org";

// =========================================================
// MODERATION HOST FILTER
// =========================================================

router.use((req, res, next) => {
    const host = String(req.headers.host || "")
        .split(":")[0]
        .toLowerCase();

    if (host !== MODERATION_HOST) {
        return next();
    }

    console.log(
        `[MODERATION] ${req.method} ${req.originalUrl}`
    );

    next();
});

module.exports = router;