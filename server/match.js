const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

// ---------------------------------------------------------
// JWT configuration
// ---------------------------------------------------------

const JWT_SECRET =
    process.env.HYDRIUM_JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error(
        "HYDRIUM_JWT_SECRET is not configured"
    );
}


// ---------------------------------------------------------
// Photon configuration (from .env)
// ---------------------------------------------------------

const PHOTON_REALTIME_APP_ID =
    process.env.PHOTON_REALTIME_APP_ID || "";

const PHOTON_CHAT_APP_ID =
    process.env.PHOTON_CHAT_APP_ID || "";

const PHOTON_VOICE_APP_ID =
    process.env.PHOTON_VOICE_APP_ID || "";

const PHOTON_REGION =
    process.env.PHOTON_REGION || "us-east1";


// ---------------------------------------------------------
// POST /player/login
// ---------------------------------------------------------

router.post(
    "/player/login",
    (req, res) => {

        console.log(
            "[MATCH] Player login requested"
        );

        return res.status(200).json({
            success: true,
            error: null,
            value: {
                sessionToken: "dummy_session_token",
                playerId: 12345
            }
        });
    }
);


// ---------------------------------------------------------
// POST /player/loginlock
// ---------------------------------------------------------

router.post(
    "/player/loginlock",
    (req, res) => {

        console.log(
            "[MATCH] Player login lock recorded:",
            req.body.LoginLock
        );

        // Empty ack (200 OK with no content)
        return res
            .status(200)
            .send();
    }
);


// ---------------------------------------------------------
// GET /connection (Photon credentials)
// ---------------------------------------------------------

router.get(
    "/player/connection-info",
    (req, res) => {

        console.log(
            "[MATCH] Photon connection info requested"
        );

        const photonAuthToken = jwt.sign(
            { dummy: "photon_auth" },
            JWT_SECRET,
            { expiresIn: 3600 }
        );

        return res.status(200).json({
            success: true,
            error: null,
            value: {
                experiments: {},
                photonAuthToken: photonAuthToken, 
                photonChatAppId: PHOTON_CHAT_APP_ID,
                photonRealtimeAppId: PHOTON_REALTIME_APP_ID,
                photonRegion: PHOTON_REGION, 
                photonRoomId: "",
                photonVoiceAppId: PHOTON_VOICE_APP_ID,
                voiceConnectionInfo: "",
                voiceServerId: ""
            }
        });
    }
);


// ---------------------------------------------------------
// GET /player/qos
// ---------------------------------------------------------

router.get(
    "/player/qos",
    (req, res) => {

        console.log(
            "[MATCH] Player QoS probe targets requested"
        );

        // Return the array of regions to probe as described in the docs
        return res
            .status(200)
            .json([
                {
                    id: "us-east1", // Region id
                    address: "127.0.0.1:5055" // Dummy host:port probe target
                }
            ]);
    }
);


// ---------------------------------------------------------
// PUT /player/photonregionpings
// ---------------------------------------------------------

router.put(
    "/player/photonregionpings",
    (req, res) => {

        console.log(
            "[MATCH] Player ping results received:",
            req.body
        );

        // Empty ack
        return res
            .status(200)
            .send();
    }
);

// ---------------------------------------------------------
// POST /player/heartbeat
// ---------------------------------------------------------

router.post(
    "/player/heartbeat",
    (req, res) => {

        // We don't want to spam the console every time the heartbeat happens (every few seconds).
        // You can uncomment this if you need to debug it.
        console.log("[MATCH] Player heartbeat received");

        // To make sure the client is happy, we should try to get the playerId from their token.
        const auth = req.headers.authorization;
        let playerId = 12345; // fallback dummy
        let platform = 0;
        let deviceClass = 0;

        if (auth && auth.startsWith("Bearer ")) {
            try {
                const token = auth.substring(7);
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded.sub) playerId = parseInt(decoded.sub, 10);
                if (decoded.platform) platform = decoded.platform;
                if (decoded.deviceClass) deviceClass = decoded.deviceClass;
            } catch (e) {
                // Ignore token errors here, just use dummy data
            }
        }

        // Return the exact presence payload described in the docs
        return res.status(200).json({
            appVersion: process.env.GAME_VERSION || "20231207",
            deviceClass: deviceClass,
            errorCode: 0, // 0 = no error
            experiments: null,
            isOnline: true, // Has a live presence row
            photonAuthToken: null, // null when not in a room
            photonChatAppId: null,
            photonRealtimeAppId: null,
            photonRegion: null,
            photonRoomId: null,
            photonVoiceAppId: null,
            platform: platform,
            playerId: playerId,
            roomInstance: null, // null when not in a room
            statusVisibility: 0,
            voiceConnectionInfo: null,
            voiceServerId: null,
            vrMovementMode: 0
        });
    }
);

// ---------------------------------------------------------
// POST /player/logout
// ---------------------------------------------------------

router.post(
    "/player/logout",
    (req, res) => {

        console.log(
            "[MATCH] Player logout requested. Clearing presence."
        );

        // Acknowledge the logout with an empty 200 OK
        return res
            .status(200)
            .send();
    }
);


module.exports = router;