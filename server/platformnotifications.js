const express = require("express");

const router = express.Router();

// ---------------------------------------------------------
// /crm/me/config/v2
// ---------------------------------------------------------

router.get(
    "/crm/me/config/v2",
    (req, res) => {
        console.log("[PLATFORM-NOTIFY] CRM config v2 requested");
        
        // Return an empty object so the client uses default settings
        return res.status(200).json({});
    }
);

// Just in case it tries to POST an update to the config
router.post(
    "/crm/me/config/v2",
    (req, res) => {
        console.log("[PLATFORM-NOTIFY] CRM config v2 save requested");
        return res.status(200).json({});
    }
);


// ---------------------------------------------------------
// SignalR Negotiate
// ---------------------------------------------------------

router.post(
    "/hub/v1/negotiate",
    (req, res) => {
        console.log("[PLATFORM-NOTIFY] SignalR negotiate requested");
        
        return res.status(200).json({
            connectionId: "fake_platform_connection_id",
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
        console.log("[PLATFORM-NOTIFY] SignalR negotiate requested (GET)");
        return res.status(200).json({
            connectionId: "fake_platform_connection_id",
            availableTransports: [
                {
                    transport: "WebSockets",
                    transferFormats: ["Text", "Binary"]
                }
            ]
        });
    }
);

// ---------------------------------------------------------
// Empty fallbacks
// ---------------------------------------------------------

router.get("/hub/v1", (req, res) => res.status(200).json({}));
router.post("/hub/v1", (req, res) => res.status(200).json({}));

module.exports = router;