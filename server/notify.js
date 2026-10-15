const express = require("express");
const crypto = require("crypto");

const router = express.Router();


// ---------------------------------------------------------
// SignalR connection registry
// ---------------------------------------------------------

const connections = new Map();


// ---------------------------------------------------------
// Create connection
// ---------------------------------------------------------

function createConnection() {

    const connectionId =
        crypto
            .randomBytes(16)
            .toString("hex");

    connections.set(
        connectionId,
        {
            createdAt:
                Date.now(),

            websocketConnected:
                false,

            handshakeComplete:
                false
        }
    );

    return connectionId;
}


// ---------------------------------------------------------
// Connection helpers
// ---------------------------------------------------------

function hasConnection(connectionId) {

    return connections.has(
        String(connectionId)
    );
}


function getConnection(connectionId) {

    return connections.get(
        String(connectionId)
    );
}


function markWebSocketConnected(
    connectionId,
    value
) {

    const connection =
        connections.get(
            String(connectionId)
        );

    if (!connection) {
        return false;
    }

    connection.websocketConnected =
        Boolean(value);

    return true;
}


function markHandshakeComplete(
    connectionId
) {

    const connection =
        connections.get(
            String(connectionId)
        );

    if (!connection) {
        return false;
    }

    connection.handshakeComplete =
        true;

    return true;
}


function removeConnection(
    connectionId
) {

    connections.delete(
        String(connectionId)
    );
}


// ---------------------------------------------------------
// POST /hub/v1/negotiate
// ---------------------------------------------------------

router.post(
    "/hub/v1/negotiate",
    (req, res) => {

        const connectionId =
            createConnection();

        console.log(
            `[NOTIFY] SignalR negotiate requested - id=${connectionId}`
        );

        return res
            .status(200)
            .json({

                connectionId:
                    connectionId,

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

        const connectionId =
            createConnection();

        console.log(
            `[NOTIFY] SignalR negotiate requested (GET) - id=${connectionId}`
        );

        return res
            .status(200)
            .json({

                connectionId:
                    connectionId,

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
// HTTP fallback for /hub/v1
// ---------------------------------------------------------
//
// A real WebSocket request is intercepted by index.js through
// server.on("upgrade"), so a WebSocket should normally never
// reach this Express route.
//
// Keeping this route is useful for diagnostics.
// ---------------------------------------------------------

router.get(
    "/hub/v1",
    (req, res) => {

        const connectionId =
            String(
                req.query.id || ""
            );

        console.warn(
            `[NOTIFY] HTTP GET reached /hub/v1 without WebSocket upgrade - id=${connectionId}`
        );

        return res
            .status(426)
            .json({
                error:
                    "WebSocket upgrade required"
            });
    }
);


// ---------------------------------------------------------
// HTTP POST fallback
// ---------------------------------------------------------

router.post(
    "/hub/v1",
    (req, res) => {

        const connectionId =
            String(
                req.query.id || ""
            );

        console.log(
            `[NOTIFY] HTTP POST /hub/v1 - id=${connectionId}`
        );

        return res
            .status(200)
            .end();
    }
);


// ---------------------------------------------------------
// Disconnect
// ---------------------------------------------------------

router.delete(
    "/hub/v1",
    (req, res) => {

        const connectionId =
            String(
                req.query.id || ""
            );

        console.log(
            `[NOTIFY] DELETE /hub/v1 - id=${connectionId}`
        );

        removeConnection(
            connectionId
        );

        return res
            .status(202)
            .end();
    }
);


// ---------------------------------------------------------
// Expose SignalR registry to index.js
// ---------------------------------------------------------

router.signalR = {

    hasConnection:
        hasConnection,

    getConnection:
        getConnection,

    markWebSocketConnected:
        markWebSocketConnected,

    markHandshakeComplete:
        markHandshakeComplete,

    removeConnection:
        removeConnection
};


module.exports = router;