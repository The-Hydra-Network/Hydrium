require("dotenv").config();

const express = require("express");
const http = require("http");

const {
    WebSocketServer,
    WebSocket
} = require("ws");


// =========================================================
// ROUTERS
// =========================================================

const auth = require("./auth");
const accounts = require("./accounts");
const club = require("./club");
const chat = require("./chat");
const cards = require("./cards");
const api = require("./api");
const econ = require("./econ");
const match = require("./match");
const notify = require("./notify");
const playerSettings = require("./playersettings");
const platformNotifications = require("./platformnotifications");
const ns = require("./ns");
const rooms = require("./rooms");
const strings = require("./strings");
const lists = require("./lists");
const compat = require("./compat");

// =========================================================
// CONFIG
// =========================================================

const port =
    Number(
        process.env.PORT ||
        9000
    );

const gameVersion =
    process.env.GAME_VERSION ||
    "20231207";

const RECORD_SEPARATOR =
    "\x1e";

const MAX_PAYLOAD =
    10 * 1024 * 1024;


// =========================================================
// EXPRESS
// =========================================================

const app =
    express();

app.disable(
    "x-powered-by"
);


// =========================================================
// BODY PARSING
// =========================================================

// =========================================================
// PHOTON CUSTOM AUTH - RAW BODY CAPTURE
// =========================================================

app.use(
    "/photon/auth",
    express.raw({
        type: () => true,
        limit: "1mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);

// =========================================================
// HTTP LOGGER
// =========================================================

app.use(
    (req, res, next) => {

        console.log(
            `[HTTP] ${req.method} ${req.originalUrl}`
        );

        next();
    }
);


// =========================================================
// ROUTERS
// =========================================================

app.use((req, res, next) => {
    const originalJson =
        res.json.bind(res);

    res.json = (body) => {
        let serialized;

        try {
            serialized =
                JSON.stringify(body);
        } catch (_) {
            serialized =
                "<unserializable>";
        }

        if (
            typeof serialized === "string" &&
            serialized.length > 2000
        ) {
            serialized =
                serialized.slice(0, 2000) +
                "...<truncated>";
        }

        console.log(
            `[HTTP-RESPONSE] ${req.method} ${req.originalUrl} -> ${res.statusCode}`
        );

        console.log(
            "[HTTP-RESPONSE] Body:",
            serialized
        );

        return originalJson(body);
    };

    next();
});

app.use(auth);

app.use(accounts);

app.use(api);

app.use(club);

app.use(econ);

app.use(match);

app.use(notify);

app.use(playerSettings);

app.use(platformNotifications);

app.use(chat);

app.use(ns);

app.use(rooms);

app.use(cards);

app.use(strings);

app.use(lists);

app.use(lists);

app.use(compat)

// =========================================================
// DATA / TELEMETRY
// =========================================================
//
// The 20231207 client periodically sends these requests.
// They are telemetry and should not block login.
//

app.post(
    "/data/heartbeat",
    (req, res) => {

        console.log(
            "[DATA] Heartbeat received"
        );

        return res
            .status(200)
            .json({});
    }
);


app.post(
    "/data/event",
    (req, res) => {

        console.log(
            "[DATA] Event received"
        );

        return res
            .status(200)
            .json({});
    }
);


// Optional safety for an unexpected GET.

app.get(
    "/data/heartbeat",
    (req, res) => {

        return res
            .status(200)
            .json({});
    }
);


app.get(
    "/data/event",
    (req, res) => {

        return res
            .status(200)
            .json({});
    }
);


// =========================================================
// 404
// =========================================================

app.use(
    (req, res) => {

        console.log("========== [404 UNHANDLED] ==========");
        console.log("[404] Method:", req.method);
        console.log("[404] Host:", req.headers.host || "");
        console.log("[404] URL:", req.originalUrl);
        console.log("[404] Query:", JSON.stringify(req.query || {}));

        if (Buffer.isBuffer(req.body)) {
            console.log("[404] Body (raw):", req.body.toString("utf8"));
        } else {
            console.log("[404] Body:", JSON.stringify(req.body ?? null));
        }

        console.log("[404] User-Agent:", req.headers["user-agent"] || "");
        console.log("=====================================");

        return res
            .status(404)
            .json({});
    }
);


// =========================================================
// EXPRESS ERROR HANDLER
// =========================================================

app.use(
    (err, req, res, next) => {

        console.error(
            `[HTTP-ERROR] ${req.method} ${req.originalUrl}`
        );

        console.error(
            err &&
            err.stack
                ? err.stack
                : err
        );

        if (
            res.headersSent
        ) {

            return next(err);
        }

        return res
            .status(500)
            .json({
                success: false,
                error: "Internal server error"
            });
    }
);


// =========================================================
// HTTP SERVER
// =========================================================

const server =
    http.createServer(
        app
    );


// =========================================================
// SIGNALR WEBSOCKET SERVER
// =========================================================

const wss =
    new WebSocketServer({

        noServer: true,

        perMessageDeflate: true,

        maxPayload:
            MAX_PAYLOAD
    });


// =========================================================
// SIGNALR SEND
// =========================================================

function sendSignalR(
    ws,
    message
) {

    if (
        !ws ||
        ws.readyState !==
        WebSocket.OPEN
    ) {

        return false;
    }

    try {

        const serialized =
            JSON.stringify(
                message
            ) +
            RECORD_SEPARATOR;

        ws.send(
            serialized
        );

        return true;

    } catch (err) {

        console.error(
            "[NOTIFY-WS] Send failed:",
            err.message
        );

        return false;
    }
}


// =========================================================
// NOTIFY HELPERS
// =========================================================

function hasNegotiatedConnection(
    connectionId
) {

    if (
        !notify ||
        !notify.signalR ||
        typeof notify.signalR.hasConnection !==
            "function"
    ) {

        console.error(
            "[NOTIFY-WS] notify.signalR.hasConnection unavailable"
        );

        return false;
    }

    try {

        return Boolean(
            notify.signalR.hasConnection(
                connectionId
            )
        );

    } catch (err) {

        console.error(
            "[NOTIFY-WS] hasConnection failed:",
            err.message
        );

        return false;
    }
}


function markWebSocketConnected(
    connectionId,
    ws
) {

    if (
        notify &&
        notify.signalR &&
        typeof notify.signalR.markWebSocketConnected ===
            "function"
    ) {

        try {

            notify.signalR
                .markWebSocketConnected(
                    connectionId,
                    ws
                );

        } catch (err) {

            console.error(
                "[NOTIFY-WS] markWebSocketConnected failed:",
                err.message
            );
        }
    }
}


function markHandshakeComplete(
    connectionId
) {

    if (
        notify &&
        notify.signalR &&
        typeof notify.signalR.markHandshakeComplete ===
            "function"
    ) {

        try {

            notify.signalR
                .markHandshakeComplete(
                    connectionId
                );

        } catch (err) {

            console.error(
                "[NOTIFY-WS] markHandshakeComplete failed:",
                err.message
            );
        }
    }
}


function removeSignalRConnection(
    connectionId
) {

    if (
        notify &&
        notify.signalR &&
        typeof notify.signalR.removeConnection ===
            "function"
    ) {

        try {

            notify.signalR
                .removeConnection(
                    connectionId
                );

        } catch (err) {

            console.error(
                "[NOTIFY-WS] removeConnection failed:",
                err.message
            );
        }
    }
}


// =========================================================
// UPGRADE
// =========================================================

server.on(
    "upgrade",
    (req, socket, head) => {

        let url;

        try {

            url =
                new URL(
                    req.url,
                    "http://127.0.0.1"
                );

        } catch (err) {

            console.error(
                "[NOTIFY-WS] Invalid upgrade URL:",
                err.message
            );

            try {

                socket.write(
                    "HTTP/1.1 400 Bad Request\r\n" +
                    "Connection: close\r\n" +
                    "\r\n"
                );

            } catch (_) {
                // ignored
            }

            socket.destroy();

            return;
        }


        if (
            url.pathname !==
            "/hub/v1"
        ) {

            console.log(
                "[NOTIFY-WS] Rejecting unknown upgrade:",
                url.pathname
            );

            try {

                socket.write(
                    "HTTP/1.1 404 Not Found\r\n" +
                    "Connection: close\r\n" +
                    "\r\n"
                );

            } catch (_) {
                // ignored
            }

            socket.destroy();

            return;
        }


        const connectionId =
            url.searchParams.get(
                "id"
            );


        console.log(
            `[NOTIFY-WS] Upgrade requested - id=${connectionId}`
        );

        console.log(
            "[NOTIFY-WS] User-Agent:",
            req.headers["user-agent"] ||
            ""
        );

        console.log(
            "[NOTIFY-WS] Origin:",
            req.headers.origin ||
            ""
        );


        if (
            !connectionId ||
            !hasNegotiatedConnection(
                connectionId
            )
        ) {

            console.log(
                `[NOTIFY-WS] Unknown connection id - id=${connectionId}`
            );

            try {

                socket.write(
                    "HTTP/1.1 404 Not Found\r\n" +
                    "Connection: close\r\n" +
                    "\r\n"
                );

            } catch (_) {
                // ignored
            }

            socket.destroy();

            return;
        }


        try {

            wss.handleUpgrade(
                req,
                socket,
                head,
                (ws) => {

                    ws.hydriumConnectionId =
                        connectionId;

                    wss.emit(
                        "connection",
                        ws,
                        req
                    );
                }
            );

        } catch (err) {

            console.error(
                `[NOTIFY-WS] Upgrade failed - id=${connectionId}:`,
                err.message
            );

            socket.destroy();
        }
    }
);


// =========================================================
// WEBSOCKET CONNECTION
// =========================================================

wss.on(
    "connection",
    (ws, req) => {

        const connectionId =
            ws.hydriumConnectionId;


        console.log(
            `[NOTIFY-WS] HTTP 101 Switching Protocols - id=${connectionId}`
        );

        console.log(
            `[NOTIFY-WS] Connected - id=${connectionId}`
        );


        markWebSocketConnected(
            connectionId,
            ws
        );


        let handshakeComplete =
            false;

        let bufferedText =
            "";

        let connectionClosed =
            false;


        // =====================================================
        // MESSAGE
        // =====================================================

        ws.on(
            "message",
            (data, isBinary) => {

                try {

                    /*
                     * IMPORTANT:
                     *
                     * BestHTTP may mark the SignalR JSON payload
                     * as a binary WebSocket frame.
                     *
                     * Do NOT return just because isBinary === true.
                     *
                     * First try decoding it as UTF-8.
                     */

                    const text =
                        data.toString(
                            "utf8"
                        );


                    if (
                        isBinary
                    ) {

                        console.log(
                            `[NOTIFY-WS] Binary frame received - id=${connectionId}, bytes=${data.length}, decoded=${JSON.stringify(text)}`
                        );

                    } else {

                        console.log(
                            `[NOTIFY-WS] RX id=${connectionId}: ${JSON.stringify(text)}`
                        );
                    }


                    bufferedText +=
                        text;


                    if (
                        bufferedText.length >
                        MAX_PAYLOAD
                    ) {

                        console.error(
                            `[NOTIFY-WS] SignalR buffer too large - id=${connectionId}`
                        );

                        if (
                            ws.readyState ===
                            WebSocket.OPEN
                        ) {

                            ws.close(
                                1009,
                                "Message too large"
                            );
                        }

                        return;
                    }


                    // SignalR JSON protocol frames are separated
                    // by ASCII 0x1E.

                    while (
                        bufferedText.includes(
                            RECORD_SEPARATOR
                        )
                    ) {

                        const separatorIndex =
                            bufferedText.indexOf(
                                RECORD_SEPARATOR
                            );


                        const frame =
                            bufferedText.substring(
                                0,
                                separatorIndex
                            );


                        bufferedText =
                            bufferedText.substring(
                                separatorIndex + 1
                            );


                        if (
                            frame.length ===
                            0
                        ) {

                            continue;
                        }


                        // =====================================
                        // HANDSHAKE
                        // =====================================

                        if (
                            !handshakeComplete
                        ) {

                            let handshake;

                            try {

                                handshake =
                                    JSON.parse(
                                        frame
                                    );

                            } catch (err) {

                                console.error(
                                    `[NOTIFY-WS] Invalid handshake JSON - id=${connectionId}:`,
                                    err.message
                                );

                                console.error(
                                    "[NOTIFY-WS] Raw handshake:",
                                    JSON.stringify(
                                        frame
                                    )
                                );


                                if (
                                    ws.readyState ===
                                    WebSocket.OPEN
                                ) {

                                    sendSignalR(
                                        ws,
                                        {
                                            error:
                                                "Invalid handshake"
                                        }
                                    );

                                    ws.close(
                                        1002,
                                        "Invalid handshake"
                                    );
                                }

                                return;
                            }


                            console.log(
                                `[NOTIFY-WS] Handshake request - id=${connectionId}:`,
                                handshake
                            );


                            const protocol =
                                handshake.protocol;

                            const version =
                                Number(
                                    handshake.version
                                );


                            console.log(
                                `[NOTIFY-WS] Protocol=${protocol}, version=${version}`
                            );


                            if (
                                protocol !==
                                    "json" ||
                                version !==
                                    1
                            ) {

                                console.error(
                                    `[NOTIFY-WS] Unsupported SignalR protocol - protocol=${protocol}, version=${version}`
                                );


                                if (
                                    ws.readyState ===
                                    WebSocket.OPEN
                                ) {

                                    sendSignalR(
                                        ws,
                                        {
                                            error:
                                                "Unsupported SignalR protocol"
                                        }
                                    );

                                    ws.close(
                                        1002,
                                        "Unsupported protocol"
                                    );
                                }

                                return;
                            }


                            // Successful SignalR handshake:
                            //
                            // {}\x1E

                            if (
                                !sendSignalR(
                                    ws,
                                    {}
                                )
                            ) {

                                console.error(
                                    `[NOTIFY-WS] Failed to send handshake response - id=${connectionId}`
                                );

                                return;
                            }


                            handshakeComplete =
                                true;


                            markHandshakeComplete(
                                connectionId
                            );


                            console.log(
                                `[NOTIFY-WS] Handshake complete - id=${connectionId}`
                            );


                            continue;
                        }


                        // =====================================
                        // NORMAL SIGNALR MESSAGE
                        // =====================================

                        let message;

                        try {

                            message =
                                JSON.parse(
                                    frame
                                );

                        } catch (err) {

                            console.error(
                                `[NOTIFY-WS] Invalid SignalR JSON - id=${connectionId}:`,
                                err.message
                            );

                            console.error(
                                "[NOTIFY-WS] Raw frame:",
                                JSON.stringify(
                                    frame
                                )
                            );

                            continue;
                        }


                        if (
                            !message ||
                            typeof message !==
                            "object"
                        ) {

                            console.log(
                                `[NOTIFY-WS] Ignoring invalid SignalR message - id=${connectionId}`
                            );

                            continue;
                        }


                        console.log(
                            `[NOTIFY-WS] SignalR message - id=${connectionId}:`,
                            JSON.stringify(
                                message,
                                null,
                                2
                            )
                        );


                        // =====================================
                        // TYPE 1 = INVOCATION
                        // =====================================

                        if (
                            message.type ===
                            1
                        ) {

                            const target =
                                typeof message.target ===
                                    "string"
                                    ? message.target
                                    : "";


                            const invocationArguments =
                                Array.isArray(
                                    message.arguments
                                )
                                    ? message.arguments
                                    : [];


                            console.log(
                                `[NOTIFY-WS] Invocation - target=${target}`
                            );

                            console.log(
                                "[NOTIFY-WS] Arguments:",
                                JSON.stringify(
                                    invocationArguments
                                )
                            );


                            // ---------------------------------
                            // SubscribeToPlayers
                            // ---------------------------------

                            if (
                                target ===
                                "SubscribeToPlayers"
                            ) {

                                const firstArgument =
                                    invocationArguments[0] &&
                                    typeof invocationArguments[0] ===
                                        "object"
                                        ? invocationArguments[0]
                                        : {};


                                const playerIds =
                                    Array.isArray(
                                        firstArgument.PlayerIds
                                    )
                                        ? firstArgument.PlayerIds
                                        : [];


                                console.log(
                                    "[NOTIFY-WS] SubscribeToPlayers player IDs:",
                                    JSON.stringify(
                                        playerIds
                                    )
                                );
                            }


                            // ---------------------------------
                            // Completion
                            //
                            // SignalR type 3 = Completion.
                            // ---------------------------------

                            if (
                                message.invocationId !==
                                    undefined &&
                                message.invocationId !==
                                    null
                            ) {

                                const invocationId =
                                    String(
                                        message.invocationId
                                    );


                                const completion = {

                                    type:
                                        3,

                                    invocationId:
                                        invocationId,

                                    result:
                                        null
                                };


                                const sent =
                                    sendSignalR(
                                        ws,
                                        completion
                                    );


                                if (
                                    sent
                                ) {

                                    console.log(
                                        `[NOTIFY-WS] Completion sent - invocationId=${invocationId}`
                                    );

                                } else {

                                    console.error(
                                        `[NOTIFY-WS] Completion NOT sent - invocationId=${invocationId}`
                                    );
                                }
                            }


                            continue;
                        }


                        // =====================================
                        // TYPE 2 = STREAM ITEM
                        // =====================================

                        if (
                            message.type ===
                            2
                        ) {

                            console.log(
                                `[NOTIFY-WS] Stream item received - id=${connectionId}`
                            );

                            continue;
                        }


                        // =====================================
                        // TYPE 3 = COMPLETION
                        // =====================================

                        if (
                            message.type ===
                            3
                        ) {

                            console.log(
                                `[NOTIFY-WS] Completion received - id=${connectionId}, invocationId=${message.invocationId}`
                            );

                            continue;
                        }


                        // =====================================
                        // TYPE 4 = STREAM INVOCATION
                        // =====================================

                        if (
                            message.type ===
                            4
                        ) {

                            console.log(
                                `[NOTIFY-WS] Stream invocation received - id=${connectionId}`
                            );

                            continue;
                        }


                        // =====================================
                        // TYPE 5 = CANCEL INVOCATION
                        // =====================================

                        if (
                            message.type ===
                            5
                        ) {

                            console.log(
                                `[NOTIFY-WS] Cancel invocation received - id=${connectionId}`
                            );

                            continue;
                        }


                        // =====================================
                        // TYPE 6 = PING
                        // =====================================

                        if (
                            message.type ===
                            6
                        ) {

                            console.log(
                                `[NOTIFY-WS] Client ping - id=${connectionId}`
                            );

                            continue;
                        }


                        // =====================================
                        // TYPE 7 = CLOSE
                        // =====================================

                        if (
                            message.type ===
                            7
                        ) {

                            console.log(
                                `[NOTIFY-WS] SignalR close message - id=${connectionId}`
                            );


                            if (
                                ws.readyState ===
                                WebSocket.OPEN
                            ) {

                                ws.close(
                                    1000,
                                    "Bye!"
                                );
                            }


                            continue;
                        }


                        // =====================================
                        // UNKNOWN
                        // =====================================

                        console.log(
                            `[NOTIFY-WS] Unhandled SignalR message type=${message.type}`
                        );
                    }

                } catch (err) {

                    console.error(
                        `[NOTIFY-WS] Message handler error - id=${connectionId}:`,
                        err &&
                        err.stack
                            ? err.stack
                            : err
                    );
                }
            }
        );


        // =====================================================
        // CLOSE
        // =====================================================

        ws.on(
            "close",
            (code, reason) => {

                if (
                    connectionClosed
                ) {

                    return;
                }


                connectionClosed =
                    true;


                const reasonText =
                    reason
                        ? reason.toString()
                        : "";


                console.log(
                    `[NOTIFY-WS] Closed - id=${connectionId}, code=${code}, reason=${reasonText}`
                );


                removeSignalRConnection(
                    connectionId
                );
            }
        );


        // =====================================================
        // ERROR
        // =====================================================

        ws.on(
            "error",
            (err) => {

                console.error(
                    `[NOTIFY-WS] Error - id=${connectionId}:`,
                    err &&
                    err.message
                        ? err.message
                        : err
                );
            }
        );
    }
);


// =========================================================
// WEBSOCKET SERVER ERROR
// =========================================================

wss.on(
    "error",
    (err) => {

        console.error(
            "[NOTIFY-WS] WebSocket server error:",
            err &&
            err.stack
                ? err.stack
                : err
        );
    }
);


// =========================================================
// HTTP CLIENT ERROR
// =========================================================

server.on(
    "clientError",
    (err, socket) => {

        console.error(
            "[HTTP] Client error:",
            err.message
        );


        if (
            !socket ||
            socket.destroyed
        ) {

            return;
        }


        try {

            socket.end(
                "HTTP/1.1 400 Bad Request\r\n" +
                "Connection: close\r\n" +
                "\r\n"
            );

        } catch (_) {

            socket.destroy();
        }
    }
);


// =========================================================
// SERVER ERROR
// =========================================================

server.on(
    "error",
    (err) => {

        if (
            err &&
            err.code ===
            "EADDRINUSE"
        ) {

            console.error(
                `[HYDRIUM] Port ${port} is already in use.`
            );

            console.error(
                "[HYDRIUM] Stop the old Node process and try again."
            );

            return;
        }


        console.error(
            "[HYDRIUM] Server error:",
            err &&
            err.stack
                ? err.stack
                : err
        );
    }
);


// =========================================================
// START
// =========================================================

server.listen(
    port,
    "127.0.0.1",
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "           HYDRIUM SERVER"
        );

        console.log(
            "========================================"
        );

        console.log(
            `[HYDRIUM] Server listening on http://127.0.0.1:${port}`
        );

        console.log(
            `[HYDRIUM] Game version: ${gameVersion}`
        );

        console.log(
            "[HYDRIUM] SignalR WebSocket transport enabled"
        );

        console.log(
            "========================================"
        );

        console.log("");
    }
);


// =========================================================
// SHUTDOWN
// =========================================================

let shuttingDown =
    false;


function shutdown(
    signal
) {

    if (
        shuttingDown
    ) {

        return;
    }


    shuttingDown =
        true;


    console.log(
        `[HYDRIUM] ${signal} received - shutting down`
    );


    for (
        const client
        of wss.clients
    ) {

        try {

            if (
                client.readyState ===
                WebSocket.OPEN
            ) {

                client.close(
                    1001,
                    "Server shutting down"
                );

            } else {

                client.terminate();
            }

        } catch (_) {
            // ignored
        }
    }


    server.close(
        () => {

            console.log(
                "[HYDRIUM] Server stopped"
            );

            process.exit(
                0
            );
        }
    );


    setTimeout(
        () => {

            console.error(
                "[HYDRIUM] Forced shutdown"
            );

            process.exit(
                1
            );
        },
        5000
    ).unref();
}


// =========================================================
// PROCESS SIGNALS
// =========================================================

process.on(
    "SIGINT",
    () => {

        shutdown(
            "SIGINT"
        );
    }
);


process.on(
    "SIGTERM",
    () => {

        shutdown(
            "SIGTERM"
        );
    }
);


process.on(
    "unhandledRejection",
    (reason) => {

        console.error(
            "[HYDRIUM] Unhandled promise rejection:",
            reason
        );
    }
);


process.on(
    "uncaughtException",
    (err) => {

        console.error(
            "[HYDRIUM] Uncaught exception:",
            err &&
            err.stack
                ? err.stack
                : err
        );


        shutdown(
            "uncaughtException"
        );
    }
);