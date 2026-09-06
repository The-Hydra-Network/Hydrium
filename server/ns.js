const express = require("express");
const path = require("path");

const router = express.Router();

const nsFile = path.join(__dirname, "blobs", "ns.json");

router.get("/", (req, res) => {
    console.log("[NS] ns.json request:", req.hostname);
    res.sendFile(nsFile);
});

module.exports = router;