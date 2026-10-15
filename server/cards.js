const express = require("express");

const router = express.Router();

const CARDS_HOST =
    "cards-hydrium.hydranet.dpdns.org";

router.use((req, res, next) => {

    const host = String(
        req.headers.host || ""
    )
        .split(":")[0]
        .toLowerCase();

    if (host !== CARDS_HOST) {
        return next();
    }

    next();
});

router.get(
    "/iam/me/channels/Announcements",
    (req, res) => {

        console.log(
            "[CARDS] Announcements channel requested"
        );

        return res
            .status(200)
            .json([]);
    }
);

module.exports = router;