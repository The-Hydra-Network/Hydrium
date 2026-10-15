const express = require("express");

const router = express.Router();

// ---------------------------------------------------------
// /pageview/consume
// ---------------------------------------------------------

router.post("/pageview/consume", (req, res) => {
    console.log("[LINK] Pageview consumed");

    return res.sendStatus(204);
});

module.exports = router;