const express = require("express");
const router = express.Router();

// ---------------------------------------------------------
// LISTS SERVICE
// ---------------------------------------------------------

router.use((req, res, next) => {
    console.log("[LISTS] Method:", req.method);
    console.log("[LISTS] URL:", req.originalUrl);
    console.log("[LISTS] Query:", req.query);
    console.log("[LISTS] Body:", req.body ?? null);
    console.log("--------------------------------");

    next();
});

router.get("/health", (req, res) => {
    return res.status(200).json({
        ok: true,
        service: "lists"
    });
});

// ---------------------------------------------------------
// GET /curatedlists/bulk
// ---------------------------------------------------------

router.get("/curatedlists/bulk", (req, res) => {
    const ids = []
        .concat(req.query.id ?? [])
        .flatMap(value => String(value).split(","))
        .filter(Boolean); //  read the node terminal bro :skull: ok where do i read dat where can i find the node terminal brah
    console.log(
        `[LISTS] Curated lists bulk requested - ids=${ids.join(",")}`
    );

    return res.status(200).json([]);
});

module.exports = router;

module.exports = router;