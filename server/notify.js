const express = require("express");

const router = express.Router();

// ---------------------------------------------------------
// /hub/v1/negotiate (SignalR Handshake)
// ---------------------------------------------------------

router.post(
    "/hub/v1/negotiate",
    (req, res) => {
        console.log("[NOTIFY] SignalR negotiate requested");
        
        // The game client expects WebSockets to be listed here.
        return res.status(200).json({
            connectionId: "fake_connection_id_123456789",
            availableTransports: [
                {
                    transport: "WebSockets",
                    transferFormats: ["Text", "Binary"]
                }
            ]
        });
    }
);

router.get(
    "/hub/v1/negotiate",
    (req, res) => {
        console.log("[NOTIFY] SignalR negotiate requested (GET)");
        return res.status(200).json({
            connectionId: "fake_connection_id_123456789",
            availableTransports: [
                {
                    transport: "WebSockets",
                    transferFormats: ["Text", "Binary"]
                }
            ]
        });
    }
);

// Leave the /hub/v1 routes as empty 200s
router.get("/hub/v1", (req, res) => res.status(200).json({}));
router.post("/hub/v1", (req, res) => res.status(200).json({}));

module.exports = router;