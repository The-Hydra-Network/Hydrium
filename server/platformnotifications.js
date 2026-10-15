const express = require("express");

const router = express.Router();


// ---------------------------------------------------------
// GET /crm/me/config/v2
// ---------------------------------------------------------

router.get(
    "/crm/me/config/v2",
    (req, res) => {

        console.log(
            "[PLATFORM-NOTIFY] CRM config v2 requested"
        );

        return res
            .status(200)
            .json({
                Configs: [],
                Experiments: [],
                Segments: []
            });
    }
);


// ---------------------------------------------------------
// POST /crm/me/config/v2
// ---------------------------------------------------------

router.post(
    "/crm/me/config/v2",
    (req, res) => {

        console.log(
            "[PLATFORM-NOTIFY] CRM config v2 save requested"
        );

        return res
            .status(200)
            .json({});
    }
);


// ---------------------------------------------------------
// POST /hub/v1/negotiate
// ---------------------------------------------------------

router.post(
    "/hub/v1/negotiate",
    (req, res) => {

        console.log(
            "[PLATFORM-NOTIFY] SignalR negotiate requested"
        );

        return res
            .status(200)
            .json({
                connectionId:
                    "fake_platform_connection_id",

                availableTransports: [
                    {
                        transport:
                            "WebSockets",

                        transferFormats: [
                            "Text",
                            "Binary"
                        ]
                    }
                ]
            });
    }
);


// ---------------------------------------------------------
// GET /hub/v1/negotiate
// ---------------------------------------------------------

router.get(
    "/hub/v1/negotiate",
    (req, res) => {

        console.log(
            "[PLATFORM-NOTIFY] SignalR negotiate requested (GET)"
        );

        return res
            .status(200)
            .json({
                connectionId:
                    "fake_platform_connection_id",

                availableTransports: [
                    {
                        transport:
                            "WebSockets",

                        transferFormats: [
                            "Text",
                            "Binary"
                        ]
                    }
                ]
            });
    }
);


// ---------------------------------------------------------
// GET /hub/v1
// ---------------------------------------------------------

router.get(
    "/hub/v1",
    (req, res) => {

        console.log(
            "[PLATFORM-NOTIFY] Hub connection requested"
        );

        return res
            .status(200)
            .json({});
    }
);


// ---------------------------------------------------------
// POST /hub/v1
// ---------------------------------------------------------

router.post(
    "/hub/v1",
    (req, res) => {

        console.log(
            "[PLATFORM-NOTIFY] Hub message received"
        );

        return res
            .status(200)
            .json({});
    }
);


// ---------------------------------------------------------
// Export
// ---------------------------------------------------------

module.exports = router;