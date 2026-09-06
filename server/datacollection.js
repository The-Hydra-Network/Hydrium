const express = require("express");
const router = express.Router();

// ---------------------------------------------------------
// /data/event
// ---------------------------------------------------------

router.post("/data/event", (req, res) => {
    return res.status(200).json({});
});

router.get("/data/event", (req, res) => {
    return res.status(200).json({});
});

// ---------------------------------------------------------
// /data/heartbeat
// ---------------------------------------------------------

router.post("/data/heartbeat", (req, res) => {
    // Acknowledge the heartbeat so the client knows we are listening
    return res.status(200).json({});
});

router.get("/data/heartbeat", (req, res) => {
    return res.status(200).json({});
});

module.exports = router;