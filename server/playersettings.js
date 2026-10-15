const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

router.use(express.json());

const JWT_SECRET = process.env.HYDRIUM_JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("HYDRIUM_JWT_SECRET is not configured");
}

function getPlayerId(req) {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
        return null;
    }

    try {
        const decoded = jwt.verify(auth.substring(7), JWT_SECRET);
        const playerId = Number(decoded.sub);

        return Number.isSafeInteger(playerId) ? playerId : null;
    } catch (err) {
        console.log("[PLAYERSETTINGS] Invalid token:", err.message);
        return null;
    }
}

// The December 2023 client requests this route during player-data bootstrap.
router.get("/playersettings", (req, res) => {
    const playerId = getPlayerId(req);

    if (playerId == null) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    return res.status(200).json([
        {
            Key: "Recroom.OOBE",
            PlayerId: playerId,
            Value: "True"
        },
        {
            Key: "TUTORIAL_COMPLETE_MASK",
            PlayerId: playerId,
            Value: "-1"
        },
        {
            Key: "FIRST_TIME_IN_FLAGS",
            PlayerId: playerId,
            Value: "0"
        }
    ]);
});

// Accept setting updates for now so bootstrap writes do not fail.
router.put("/playersettings", (req, res) => {
    const playerId = getPlayerId(req);

    if (playerId == null) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    return res.status(200).send();
});

router.delete("/playersettings", (req, res) => {
    const playerId = getPlayerId(req);

    if (playerId == null) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    return res.status(200).send();
});

module.exports = router;
