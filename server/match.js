const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const activeRoomByLoginLock = new Map();

// =========================================================
// JWT CONFIGURATION
// =========================================================

const JWT_SECRET =
    process.env.HYDRIUM_JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error(
        "HYDRIUM_JWT_SECRET is not configured"
    );
}


// =========================================================
// GAME CONFIGURATION
// =========================================================

const GAME_VERSION =
    process.env.GAME_VERSION ||
    "20231207";


// =========================================================
// PHOTON CONFIGURATION
// =========================================================

const PHOTON_REALTIME_APP_ID =
    "390700d6-7387-4fa5-b6d7-7ee39e46ad4a";

const PHOTON_VOICE_APP_ID =
    "91c066ff-4be0-4c77-9733-d9e5831051a5";

const PHOTON_CHAT_APP_ID =
    "5daaf075-d152-4c42-a4f7-47391cbff9be";

const PHOTON_REGION =
    "us";

const PHOTON_AUTH_TOKEN =
    "HYDRIUM_TEST_TOKEN_001";


// =========================================================
// AUTHENTICATION HELPERS
// =========================================================

function getDecodedToken(req) {

    const auth =
        req.headers.authorization;

    if (
        !auth ||
        !auth.startsWith("Bearer ")
    ) {
        return null;
    }

    try {

        return jwt.verify(
            auth.substring(7),
            JWT_SECRET
        );

    } catch (err) {

        console.log(
            "[MATCH] Invalid bearer token:",
            err.message
        );

        return null;
    }
}


function getAccountId(req) {

    const decoded =
        getDecodedToken(req);

    if (
        !decoded ||
        decoded.sub === undefined ||
        decoded.sub === null
    ) {
        return null;
    }

    const accountId =
        Number(
            decoded.sub
        );

    if (
        !Number.isSafeInteger(
            accountId
        )
    ) {
        return null;
    }

    return accountId;
}


// =========================================================
// POST /player/login
// =========================================================

router.post(
    "/player/login",
    (req, res) => {

        console.log(
            "[MATCH] Player login requested"
        );

        const playerId =
            getAccountId(req);

        if (
            !Number.isSafeInteger(
                playerId
            )
        ) {

            console.log(
                "[MATCH] Player login rejected - invalid account token"
            );

            return res
                .status(401)
                .json({
                    success: false,
                    error: "Unauthorized",
                    value: null
                });
        }

        const sessionToken =
            jwt.sign(
                {
                    sub:
                        String(
                            playerId
                        ),

                    type:
                        "player_session",

                    ver:
                        GAME_VERSION
                },
                JWT_SECRET,
                {
                    expiresIn:
                        3600
                }
            );

        console.log(
            `[MATCH] Player login successful - playerId=${playerId}`
        );

        return res
            .status(200)
            .json({
                success: true,

                error: null,

                value: {
                    sessionToken:
                        sessionToken,

                    playerId:
                        playerId
                }
            });
    }
);


// =========================================================
// POST /player/loginlock
// =========================================================

router.post(
    "/player/loginlock",
    (req, res) => {

        console.log(
            "[MATCH] Player login lock recorded:",
            req.body
                ? req.body.LoginLock
                : undefined
        );

        return res
            .status(200)
            .send();
    }
);


// =========================================================
// GET /player/qos
// =========================================================

router.get(
    "/player/qos",
    (req, res) => {

        console.log(
            "[MATCH] Player QoS probe targets requested"
        );

        return res
            .status(200)
            .json([
                {
                    id:
                        "us-east1",

                    address:
                        "127.0.0.1:5055"
                }
            ]);
    }
);


// =========================================================
// PUT /player/photonregionpings
// =========================================================

router.put(
    "/player/photonregionpings",
    (req, res) => {

        console.log(
            "[MATCH] Player Photon region pings received:",
            req.body
        );

        return res
            .status(200)
            .send();
    }
);

// =========================================================
// GET /player/connection-info
// =========================================================

router.get(
    "/player/connection-info",
    (req, res) => {
        console.log(
            "[MATCH] Photon connection info requested"
        );

        const playerId =
            getAccountId(req);

        if (
            !Number.isSafeInteger(
                playerId
            )
        ) {
            console.log(
                "[MATCH] Photon connection info rejected - invalid account token"
            );

            return res
                .status(401)
                .json({
                    success: false,
                    error: "Unauthorized",
                    value: null
                });
        }

        const roomInstanceId =
            Number(
                req.query.roomInstanceId
            );

        if (
            !Number.isSafeInteger(
                roomInstanceId
            )
        ) {
            console.log(
                "[MATCH] Photon connection info rejected - invalid roomInstanceId"
            );

            return res
                .status(400)
                .json({
                    success: false,
                    error:
                        "Invalid roomInstanceId",
                    value: null
                });
        }

        const photonRoomId =
            String(roomInstanceId);

        console.log(
            "[MATCH] Photon config - " +
            `player=${playerId}, ` +
            `realtime=${PHOTON_REALTIME_APP_ID}, ` +
            `voice=${PHOTON_VOICE_APP_ID}, ` +
            `chat=${PHOTON_CHAT_APP_ID}, ` +
            `region=${PHOTON_REGION}, ` +
            `room=${photonRoomId}, ` +
            `authToken=${PHOTON_AUTH_TOKEN}`
        );

        return res
            .status(200)
            .json({
                success:
                    true,

                error:
                    null,

                value: {
                    experiments:
                        {},

                    photonAuthToken:
                        PHOTON_AUTH_TOKEN,

                    photonChatAppId:
                        PHOTON_CHAT_APP_ID,

                    photonRealtimeAppId:
                        PHOTON_REALTIME_APP_ID,

                    photonRegion:
                        PHOTON_REGION,

                    // Era "" e causava o erro 8707.
                    photonRoomId:
                        photonRoomId,

                    photonVoiceAppId:
                        PHOTON_VOICE_APP_ID,

                    voiceConnectionInfo:
                        "",

                    voiceServerId:
                        ""
                }
            });
    }
);

// =========================================================
// POST /player/heartbeat
// =========================================================

router.post(
    "/player/heartbeat",
    (req, res) => {
        console.log(
            "[MATCH] Player heartbeat received"
        );

        // Precisa ser declarado antes de ser usado nos logs.
        const decoded =
            getDecodedToken(req);

        console.log(
            "[MATCH] Player heartbeat body:",
            JSON.stringify(req.body, null, 2)
        );

        console.log(
            "[MATCH] Player heartbeat token:",
            JSON.stringify(decoded, null, 2)
        );

        let playerId =
            null;

        let platform =
            0;

        let deviceClass =
            0;

        if (
            decoded &&
            decoded.sub !== undefined &&
            decoded.sub !== null
        ) {
            const parsedPlayerId =
                Number(decoded.sub);

            if (
                Number.isSafeInteger(
                    parsedPlayerId
                )
            ) {
                playerId =
                    parsedPlayerId;
            }
        }

        if (
            decoded &&
            decoded.platform !== undefined
        ) {
            const parsedPlatform =
                Number(decoded.platform);

            if (
                Number.isFinite(
                    parsedPlatform
                )
            ) {
                platform =
                    parsedPlatform;
            }
        }

        if (
            decoded &&
            decoded.deviceClass !== undefined
        ) {
            const parsedDeviceClass =
                Number(decoded.deviceClass);

            if (
                Number.isFinite(
                    parsedDeviceClass
                )
            ) {
                deviceClass =
                    parsedDeviceClass;
            }
        }

        const loginLock =
            req.body?.LoginLock;

        const activeRoom =
            loginLock
                ? activeRoomByLoginLock.get(
                    String(loginLock)
                ) ?? null
                : null;

        console.log(
            "[MATCH] Heartbeat LoginLock:",
            loginLock ?? null
        );

        console.log(
            "[MATCH] Heartbeat active room:",
            JSON.stringify(activeRoom, null, 2)
        );

        return res
            .status(200)
            .json({
                appVersion:
                    GAME_VERSION,

                deviceClass:
                    deviceClass,

                errorCode:
                    0,

                experiments:
                    null,

                isOnline:
                    true,

                photonAuthToken:
                    PHOTON_AUTH_TOKEN,

                photonChatAppId:
                    PHOTON_CHAT_APP_ID,

                photonRealtimeAppId:
                    PHOTON_REALTIME_APP_ID,

                photonRegion:
                    activeRoom?.photonRegionId ??
                    PHOTON_REGION,

                photonRoomId:
                    activeRoom?.photonRoomId ??
                    null,

                photonVoiceAppId:
                    PHOTON_VOICE_APP_ID,

                platform:
                    platform,

                playerId:
                    playerId,

                roomInstance:
                    activeRoom,

                statusVisibility:
                    0,

                voiceConnectionInfo:
                    null,

                voiceServerId:
                    null,

                vrMovementMode:
                    0
            });
    }
);

// =========================================================
// POST /player/exclusivelogin
// =========================================================

router.post(
    "/player/exclusivelogin",
    (req, res) => {

        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "[MATCH] EXCLUSIVE LOGIN REQUEST"
        );

        console.log(
            "========================================"
        );

        console.log(
            "[MATCH] Method:",
            req.method
        );

        console.log(
            "[MATCH] URL:",
            req.originalUrl
        );

        console.log(
            "[MATCH] Content-Type:",
            req.headers["content-type"] ||
            "<missing>"
        );

        console.log(
            "[MATCH] Content-Length:",
            req.headers["content-length"] ||
            "<missing>"
        );

        console.log(
            "[MATCH] User-Agent:",
            req.headers["user-agent"] ||
            "<missing>"
        );

        console.log(
            "[MATCH] Authorization:",
            req.headers.authorization
                ? "Bearer <present>"
                : "<missing>"
        );

        console.log(
            "[MATCH] Body:"
        );

        console.log(
            JSON.stringify(
                req.body,
                null,
                2
            )
        );

        const decoded =
            getDecodedToken(req);

        console.log(
            "[MATCH] Decoded token:"
        );

        console.log(
            decoded
                ? JSON.stringify(
                    decoded,
                    null,
                    2
                )
                : "<invalid/null>"
        );

        const playerId =
            getAccountId(req);

        console.log(
            "[MATCH] Resolved playerId:",
            playerId
        );

        if (
            !Number.isSafeInteger(
                playerId
            )
        ) {

            console.log(
                "[MATCH] Exclusive login rejected - invalid token"
            );

            console.log(
                "========================================"
            );

            console.log("");

            return res
                .status(401)
                .json({
                    success:
                        false,

                    error:
                        "Unauthorized",

                    value:
                        null
                });
        }

        const loginLock =
            req.body &&
            typeof req.body.LoginLock ===
                "string"
                ? req.body.LoginLock
                : null;

        const takeOverExclusiveSession =
            req.body &&
            req.body.TakeOverExclusiveSession !==
                undefined
                ? String(
                    req.body.TakeOverExclusiveSession
                )
                : null;

        console.log(
            "[MATCH] LoginLock:",
            loginLock
        );

        console.log(
            "[MATCH] TakeOverExclusiveSession:",
            takeOverExclusiveSession
        );

        console.log(
            `[MATCH] Exclusive login accepted - playerId=${playerId}`
        );

        console.log(
            "========================================"
        );

        console.log(
            "[MATCH] END EXCLUSIVE LOGIN REQUEST"
        );

        console.log(
            "========================================"
        );

        console.log("");

        return res
            .status(200)
            .json({
                success:
                    true,

                error:
                    null,

                value:
                    null
            });
    }
);


// =========================================================
// POST /player/logout
// =========================================================

router.post(
    "/player/logout",
    (req, res) => {

        console.log(
            "[MATCH] Player logout requested. Clearing presence."
        );

        return res
            .status(200)
            .send();
    }
);

// =========================================================
// POST /matchmake/dorm
// =========================================================
//
// Hydrium / REC26
// Target runtime: 20231207
//
// Cria a instância do Dorm e associa ela ao LoginLock.
// O mesmo objeto será devolvido posteriormente pelo
// /player/heartbeat.
//
// =========================================================

router.post(
    "/matchmake/dorm",
    async (req, res) => {
        try {
            console.log(
                "[MATCH] Dorm matchmaking requested"
            );

            console.log(
                "[MATCH] Dorm request body:",
                JSON.stringify(req.body, null, 2)
            );

            const loginLock =
                req.body?.LoginLock ??
                req.body?.loginLock ??
                null;

            if (!loginLock) {
                console.log(
                    "[MATCH] Dorm matchmaking rejected - LoginLock missing"
                );

                return res
                    .status(400)
                    .json({
                        errorCode: 1,
                        error:
                            "LoginLock is required",
                        roomInstance:
                            null
                    });
            }

            const instanceId =
                Math.floor(
                    Math.random() *
                    999999000
                ) + 1000;

            const photonRoomId =
                `hydriumDorm-${instanceId}-room`;

            const decoded =
                getDecodedToken(req);

            let playerId =
                null;

            if (
                decoded &&
                decoded.sub !== undefined &&
                decoded.sub !== null
            ) {
                const parsedPlayerId =
                    Number(decoded.sub);

                if (
                    Number.isSafeInteger(
                        parsedPlayerId
                    )
                ) {
                    playerId =
                        parsedPlayerId;
                }
            }

            const playerName =
                decoded?.name ??
                decoded?.username ??
                "HydriumPlayer";

            const roomInstance = {
                roomInstanceId:
                    instanceId,

                gameSessionId:
                    instanceId,

                roomId:
                    1,

                // Campo utilizado pelo cliente para encontrar
                // o SubRoom correspondente em room.SubRooms.
                subRoomId:
                    1,

                // Mantidos por compatibilidade com contratos
                // antigos que usam RoomScene.
                roomSceneId:
                    1,

                roomSceneLocationId:
                    "76d98498-60a1-430c-ab76-b54a29b7a163",

                name:
                    `@${playerName}'s Dorm`,

                location:
                    "76d98498-60a1-430c-ab76-b54a29b7a163",

                dataBlob:
                    "",

                isPrivate:
                    true,

                isSandbox:
                    true,

                isFull:
                    false,

                gameInProgress:
                    false,

                maxCapacity:
                    4,

                photonRegion:
                    PHOTON_REGION,

                photonRegionId:
                    PHOTON_REGION,

                photonRoomId:
                    photonRoomId
            };

            activeRoomByLoginLock.set(
                String(loginLock),
                roomInstance
            );

            console.log(
                "[MATCH] Dorm instance stored:",
                JSON.stringify(
                    {
                        loginLock:
                            String(loginLock),
                        playerId:
                            playerId,
                        roomInstance:
                            roomInstance
                    },
                    null,
                    2
                )
            );

            const response = {
                errorCode:
                    0,

                roomInstance:
                    roomInstance
            };

            console.log(
                "[MATCH] Dorm matchmaking response:",
                JSON.stringify(
                    response,
                    null,
                    2
                )
            );

            return res
                .status(200)
                .json(response);
        } catch (error) {
            console.error(
                "[MATCH] Dorm matchmaking error:",
                error
            );

            return res
                .status(500)
                .json({
                    errorCode:
                        1,
                    error:
                        "Dorm matchmaking failed",
                    roomInstance:
                        null
                });
        }
    }
);

// =========================================================
// POST /photon/auth
// =========================================================

router.post(
    "/photon/auth",
    (req, res) => {
        console.log(
            "[PHOTON AUTH] Request received"
        );

        let token = "";

        if (Buffer.isBuffer(req.body)) {
            token = req.body
                .toString("utf8")
                .trim();
        } else if (
            typeof req.body === "string"
        ) {
            token = req.body.trim();
        } else if (
            req.body &&
            typeof req.body === "object"
        ) {
            token =
                req.body.token ??
                req.body.Token ??
                req.body.authToken ??
                "";
        }

        console.log(
            "[PHOTON AUTH] Token:",
            token
        );

        if (
            token !== PHOTON_AUTH_TOKEN
        ) {
            console.warn(
                "[PHOTON AUTH] Invalid token"
            );

            return res
                .status(200)
                .json({
                    ResultCode: 2,
                    Message:
                        "Invalid authentication token"
                });
        }

        const response = {
            ResultCode: 1,
            UserId: "108146957",
            Nickname: "HydriumPlayer"
        };

        console.log(
            "[PHOTON AUTH] Success:",
            JSON.stringify(response)
        );

        return res
            .status(200)
            .json(response);
    }
);

// =========================================================
// POST /roominstance/:roomInstanceId/reportjoinresult
// =========================================================

router.post(
    "/roominstance/:roomInstanceId/reportjoinresult",
    (req, res) => {
        const roomInstanceId =
            Number(req.params.roomInstanceId);

        const result =
            Number(req.body?.result);

        console.log(
            "[MATCH] Room join result:",
            JSON.stringify(
                {
                    roomInstanceId:
                        roomInstanceId,
                    result:
                        result
                },
                null,
                2
            )
        );

        return res
            .status(200)
            .end();
    }
);

// =========================================================
// GET /photon_access_token
// =========================================================

router.get("/photon_access_token", (req, res) => {
    console.log("[MATCH] Photon access token requested");

    const activeRooms =
        Array.from(activeRoomByLoginLock.values());

    const activeRoom =
        activeRooms.length > 0
            ? activeRooms[activeRooms.length - 1]
            : null;

    const roomInstanceId =
        activeRoom?.roomInstanceId ??
        activeRoom?.roomInstance?.roomInstanceId ??
        null;

    const response = {
        Permissions: [],
        PhotonAccessToken: "",
        RoomInstanceId: roomInstanceId
    };

    console.log(
        "[MATCH] Photon access token response:",
        response
    );

    return res.status(200).json(response);
});

// =========================================================
// POST /matchmake/none
// Initial lifecycle destination: Orientation
// =========================================================

router.post("/matchmake/none", (req, res) => {
    console.log("[MATCH] Matchmake none requested");
    console.log("[MATCH] Matchmake none body:", req.body);

    const loginLock =
        req.body?.LoginLock ??
        req.body?.loginLock;

    if (!loginLock) {
        return res.status(400).json({
            errorCode: 1,
            roomInstance: null
        });
    }

    const normalizedLoginLock =
        String(loginLock);

    const roomInstanceId =
        Math.floor(
            Math.random() * 900000000
        ) + 1000000;

    const roomInstance = {
        roomInstanceId: roomInstanceId,
        gameSessionId: roomInstanceId,

        roomId: 13,
        subRoomId: 23,
        roomSceneId: 23,

        roomSceneLocationId:
            "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",

        name: "Orientation",

        location:
            "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",

        dataBlob: "",

        isPrivate: true,
        isSandbox: false,
        isFull: false,
        gameInProgress: false,

        maxCapacity: 1,

        photonRegion: PHOTON_REGION,
        photonRegionId: PHOTON_REGION,

        photonRoomId:
            `hydriumOrientation-${roomInstanceId}-room`
    };

    activeRoomByLoginLock.set(
        normalizedLoginLock,
        roomInstance
    );

    console.log(
        "[MATCH] Orientation instance created:",
        JSON.stringify(roomInstance, null, 2)
    );

    return res.status(200).json({
        errorCode: 0,
        roomInstance: roomInstance
    });
});

// =========================================================
// POST /matchmake/room/:roomId
// =========================================================

router.post("/matchmake/room/:roomId", (req, res) => {
    const roomId = Number(req.params.roomId);
    const loginLock =
        req.body?.LoginLock ??
        req.body?.loginLock;

    console.log(
        `[MATCH] Room matchmaking requested - roomId=${roomId}`
    );

    if (roomId !== 13) {
        return res.status(404).json({
            errorCode: 1,
            roomInstance: null
        });
    }

    const roomInstanceId =
        Math.floor(
            Math.random() * 900000000
        ) + 1000000;

    const roomInstance = {
        roomInstanceId: roomInstanceId,
        gameSessionId: roomInstanceId,
        roomId: 13,
        subRoomId: 23,
        roomSceneId: 23,
        roomSceneLocationId:
            "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",
        location:
            "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",
        name: "Orientation",
        photonRegionId: PHOTON_REGION,
        photonRegion: PHOTON_REGION,
        photonRoomId:
            `hydriumOrientation-${roomInstanceId}-room`,
        isSandbox: false,
        dataBlobName: "",
        isPrivate: true,
        isFull: false,
        gameInProgress: false,
        maxCapacity: 1
    };

    if (loginLock) {
        activeRoomByLoginLock.set(
            loginLock,
            roomInstance
        );
    }

    return res.status(200).json({
        errorCode: 0,
        roomInstance: roomInstance
    });
});

// =========================================================
// EXPORT
// =========================================================

module.exports = router;