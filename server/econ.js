const express = require("express");

const {
    outfitByAccountId
} = require("./state");
const path = require("path");
const jwt = require("jsonwebtoken");
const fs = require("fs");

const pb = require("./pb");

const router = express.Router();

router.use(
    express.json()
);

const JWT_SECRET =
    process.env.HYDRIUM_JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error(
        "HYDRIUM_JWT_SECRET is not configured"
    );
}

// ---------------------------------------------------------
// PocketBase collections
// ---------------------------------------------------------

const COLLECTIONS =
    pb.hydriumCollections;

const AVATAR_COLLECTION =
    "hydrium_avatar";

const SAVED_AVATAR_COLLECTION =
    "hydrium_custom_avatar_saves";

const CUSTOM_AVATAR_COLLECTION =
    "hydrium_custom_avatar_items";

const DEFAULT_AVATAR_ITEMS_COLLECTION =
    "hydrium_default_avatar_items";

const OBJECTIVES_COLLECTION =
    "hydrium_objectives";

const STOREFRONT_COLLECTION =
    "hydrium_storefronts";

// ---------------------------------------------------------
// Static response blobs
// ---------------------------------------------------------

const DEFAULT_UNLOCKED_PATH =
    path.join(
        __dirname,
        "blobs",
        "defaultunlocked.json"
    );

const AVATAR_ITEMS_PATH =
    path.join(
        __dirname,
        "Avatar",
        "AvatarItems.json"
    );

const CUSTOM_AVATAR_ITEMS_PATH =
    path.join(
        __dirname,
        "blobs",
        "custom-avatar-items-owned.json"
    );

// ---------------------------------------------------------
// Authentication helper
// ---------------------------------------------------------

function getAccountId(req) {

    const auth =
        req.headers.authorization;

    if (
        !auth ||
        !auth.startsWith(
            "Bearer "
        )
    ) {
        return null;
    }

    try {

        const token =
            auth.substring(7);

        const decoded =
            jwt.verify(
                token,
                JWT_SECRET
            );

        if (!decoded.sub) {
            return null;
        }

        return String(
            decoded.sub
        );

    } catch (err) {

        console.log(
            "[ECON] Invalid token:",
            err.message
        );

        return null;
    }
}

// ---------------------------------------------------------
// Find account by Rec Room accountId
// ---------------------------------------------------------

async function getAccountById(
    accountId
) {

    const numericId =
        Number(accountId);

    if (
        !Number.isSafeInteger(
            numericId
        )
    ) {
        throw new Error(
            "Invalid accountId"
        );
    }

    return await pb
        .collection(
            COLLECTIONS.accounts
        )
        .getFirstListItem(
            `accountId = ${numericId}`
        );
}

// ---------------------------------------------------------
// Default avatar
// ---------------------------------------------------------

function getDefaultAvatar() {
    return {
        OutfitSelections: "",
        FaceFeatures: "",
        SkinColor: "",
        HairColor: ""
    };
}

// ---------------------------------------------------------
// Normalize avatar record
// ---------------------------------------------------------

function normalizeAvatarRecord(record) {
    if (!record) {
        return getDefaultAvatar();
    }

    let avatar =
        record.data ??
        record.avatar ??
        record;

    if (typeof avatar === "string") {
        try {
            avatar = JSON.parse(avatar);
        } catch {
            return getDefaultAvatar();
        }
    }

    if (
        !avatar ||
        typeof avatar !== "object" ||
        Array.isArray(avatar)
    ) {
        return getDefaultAvatar();
    }

    const legacy =
        avatar.LegacyData &&
        typeof avatar.LegacyData === "object"
            ? avatar.LegacyData
            : avatar;

    return {
        OutfitSelections:
            typeof legacy.OutfitSelections === "string"
                ? legacy.OutfitSelections
                : typeof legacy.SelectionsV1 === "string"
                    ? legacy.SelectionsV1
                    : "",

        FaceFeatures:
            typeof legacy.FaceFeatures === "string"
                ? legacy.FaceFeatures
                : "",

        SkinColor:
            typeof legacy.SkinColor === "string"
                ? legacy.SkinColor
                : "",

        HairColor:
            typeof legacy.HairColor === "string"
                ? legacy.HairColor
                : ""
    };
}
// ---------------------------------------------------------
// GET /api/avatar/v4/items
// ---------------------------------------------------------

router.get("/api/avatar/v4/items", (req, res) => {
    console.log("[ECON] Avatar items requested");

    return res.sendFile(
        AVATAR_ITEMS_PATH,
        (err) => {
            if (err && !res.headersSent) {
                console.error(
                    "[ECON] Failed to send AvatarItems.json:",
                    err.message
                );

                return res
                    .status(500)
                    .json([]);
            }
        }
    );
});
// ---------------------------------------------------------
// GET /api/avatar/v1/defaultunlocked
// ---------------------------------------------------------

router.get(
    "/api/avatar/v1/defaultunlocked",
    (req, res) => {

        console.log(
            "[ECON] Default unlocked requested"
        );

        return res.sendFile(
            DEFAULT_UNLOCKED_PATH
        );
    }
);

// ---------------------------------------------------------
// POST /api/avatar/v1/lockeditems/bulk
// ---------------------------------------------------------

router.post(
    "/api/avatar/v1/lockeditems/bulk",
    (req, res) => {

        console.log(
            "[ECON] POST /api/avatar/v1/lockeditems/bulk"
        );

        console.log(
            "[ECON] AvatarItemDescriptions:",
            req.body.AvatarItemDescriptions
        );

        return res
            .status(200)
            .json([]);
    }
);

// ---------------------------------------------------------
// GET /econ/customAvatarItems/v1/owned
// ---------------------------------------------------------

router.get(
    "/econ/customAvatarItems/v1/owned",
    async (req, res) => {

        console.log(
            "[ECON] Custom avatar items owned requested"
        );

        const accountId =
            getAccountId(req);

        if (!accountId) {

            return res
                .status(401)
                .json({

                    Results:
                        [],

                    TotalResults:
                        0
                });
        }

        try {

            const account =
                await getAccountById(
                    accountId
                );

            const result =
                await pb
                    .collection(
                        CUSTOM_AVATAR_COLLECTION
                    )
                    .getList(
                        1,
                        100,
                        {
                            filter:
                                `accountId = ${Number(account.accountId)}`
                        }
                    );

            return res
                .status(200)
                .json({

                    Results:
                        result.items,

                    TotalResults:
                        result.totalItems
                });

        } catch (err) {

            console.error(
                "[ECON] Custom avatar lookup failed:",
                err.response ||
                err.message ||
                err
            );

            return res
                .status(200)
                .json({

                    Results:
                        [],

                    TotalResults:
                        0
                });
        }
    }
);

// ---------------------------------------------------------
// GET /api/avatar/v2
// ---------------------------------------------------------

router.get("/api/avatar/v2/gifts", (req, res) => {
    console.log("[ECON] Avatar gifts requested");
    return res.status(200).json([]);
});

router.get("/api/avatar/v2", async (req, res) => {
    const accountId = getAccountId(req);

    if (!accountId) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    const numericAccountId =
        Number(accountId);

    const memoryOutfit =
        outfitByAccountId.get(
            numericAccountId
        );

    if (memoryOutfit) {
        const avatar =
            normalizeAvatarRecord(
                memoryOutfit
            );

        console.log(
            `[ECON] Avatar loaded from current outfit for accountId=${numericAccountId}:`,
            JSON.stringify(avatar)
        );

        return res
            .status(200)
            .json(avatar);
    }
    try {
        const numericAccountId =
            Number(accountId);

        const result =
            await pb
                .collection(AVATAR_COLLECTION)
                .getList(1, 1, {
                    filter:
                        `accountId = ${numericAccountId}`
                });

        const record =
            result.items.length > 0
                ? result.items[0]
                : null;

        return res
            .status(200)
            .json(
                normalizeAvatarRecord(record)
            );

    } catch (err) {
        console.error(
            "[ECON] Avatar lookup failed:",
            err.message
        );

        return res
            .status(200)
            .json(getDefaultAvatar());
    }
});
// ---------------------------------------------------------
// POST /api/avatar/v2/set
// ---------------------------------------------------------

router.post("/api/avatar/v2/set", async (req, res) => {
    console.log("[ECON] Avatar v2 set requested");

    const accountId = getAccountId(req);

    if (!accountId) {
        return res
            .status(401)
            .json(false);
    }

    try {

        const avatar =
            normalizeAvatarRecord(req.body);

        const existing =
            await pb
                .collection(AVATAR_COLLECTION)
                .getList(1, 1, {
                    filter:
                        `accountId = ${numericAccountId}`
                });

        const data = {
            accountId:
                numericAccountId,
            data:
                avatar
        };

        if (existing.items.length > 0) {
            await pb
                .collection(AVATAR_COLLECTION)
                .update(
                    existing.items[0].id,
                    data
                );
        } else {
            await pb
                .collection(AVATAR_COLLECTION)
                .create(data);
        }

        console.log(
            "[ECON] Avatar saved:",
            JSON.stringify(avatar)
        );

        return res
            .status(200)
            .json(true);

    } catch (err) {
        console.error(
            "[ECON] Avatar save failed:",
            err.message
        );

        return res
            .status(500)
            .json(false);
    }
});
// ---------------------------------------------------------
// GET /api/avatar/v3/saved
// ---------------------------------------------------------

router.get(
    "/api/avatar/v3/saved",
    async (req, res) => {

        console.log(
            "[ECON] Saved avatar v3 requested"
        );

        const accountId =
            getAccountId(req);

        if (!accountId) {

            return res
                .status(401)
                .json({

                    error:
                        "Unauthorized"
                });
        }

        try {

            const numericAccountId =
                Number(accountId);

            const result =
                await pb
                    .collection(
                        SAVED_AVATAR_COLLECTION
                    )
                    .getList(
                        1,
                        100,
                        {

                            filter:
                                `accountId = ${numericAccountId}`,

                            sort:
                                "slot"
                        }
                    );

            return res
                .status(200)
                .json(
                    result.items
                );

        } catch (err) {

            console.error(
                "[ECON] Saved avatar lookup failed:",
                err.message
            );

            return res
                .status(500)
                .json({

                    error:
                        "Internal server error"
                });
        }
    }
);

// ---------------------------------------------------------
// POST /api/avatar/v3/saved/set
// ---------------------------------------------------------

router.post(
    "/api/avatar/v3/saved/set",
    async (req, res) => {

        console.log(
            "[ECON] Saved avatar v3 set requested"
        );

        const accountId =
            getAccountId(req);

        if (!accountId) {

            return res
                .status(401)
                .json({

                    error:
                        "Unauthorized"
                });
        }

        try {

            const numericAccountId =
                Number(accountId);

            const slot =
                Number(
                    req.body.slot ??
                    req.body.Slot ??
                    0
                );

            const existing =
                await pb
                    .collection(
                        SAVED_AVATAR_COLLECTION
                    )
                    .getList(
                        1,
                        1,
                        {
                            filter:
                                `accountId = ${numericAccountId} && slot = ${slot}`
                        }
                    );

            const data = {

                accountId:
                    numericAccountId,

                slot:
                    slot,

                data:
                    req.body
            };

            if (
                existing.items.length >
                0
            ) {

                await pb
                    .collection(
                        SAVED_AVATAR_COLLECTION
                    )
                    .update(
                        existing.items[0].id,
                        data
                    );

            } else {

                await pb
                    .collection(
                        SAVED_AVATAR_COLLECTION
                    )
                    .create(
                        data
                    );
            }

            return res
                .status(200)
                .json({

                    success:
                        true
                });

        } catch (err) {

            console.error(
                "[ECON] Saved avatar v3 save failed:",
                err.message
            );

            return res
                .status(500)
                .json({

                    error:
                        "Internal server error"
                });
        }
    }
);

// ---------------------------------------------------------
// POST /api/avatar/v4/saved/set
// ---------------------------------------------------------

router.post(
    "/api/avatar/v4/saved/set",
    async (req, res) => {

        console.log(
            "[ECON] Saved avatar v4 set requested"
        );

        const accountId =
            getAccountId(req);

        if (!accountId) {

            return res
                .status(401)
                .json({

                    error:
                        "Unauthorized"
                });
        }

        try {

            const numericAccountId =
                Number(accountId);

            const slot =
                Number(
                    req.body.slot ??
                    req.body.Slot ??
                    0
                );

            const existing =
                await pb
                    .collection(
                        SAVED_AVATAR_COLLECTION
                    )
                    .getList(
                        1,
                        1,
                        {
                            filter:
                                `accountId = ${numericAccountId} && slot = ${slot}`
                        }
                    );

            const data = {

                accountId:
                    numericAccountId,

                slot:
                    slot,

                data:
                    req.body
            };

            if (
                existing.items.length >
                0
            ) {

                await pb
                    .collection(
                        SAVED_AVATAR_COLLECTION
                    )
                    .update(
                        existing.items[0].id,
                        data
                    );

            } else {

                await pb
                    .collection(
                        SAVED_AVATAR_COLLECTION
                    )
                    .create(
                        data
                    );
            }

            return res
                .status(200)
                .json({

                    success:
                        true
                });

        } catch (err) {

            console.error(
                "[ECON] Saved avatar v4 save failed:",
                err.message
            );

            return res
                .status(500)
                .json({

                    error:
                        "Internal server error"
                });
        }
    }
);

// ---------------------------------------------------------
// GET /api/avatar/v2/:id
// ---------------------------------------------------------

router.get(
    "/api/avatar/v2/:id",
    async (req, res) => {

        const requestedId =
            Number(
                req.params.id
            );

        console.log(
            `[ECON] Avatar v2 requested for accountId=${requestedId}`
        );

        if (
            !Number.isSafeInteger(
                requestedId
            )
        ) {

            return res
                .status(400)
                .json({

                    error:
                        "Invalid accountId"
                });
        }

        try {

            const result =
                await pb
                    .collection(
                        AVATAR_COLLECTION
                    )
                    .getList(
                        1,
                        1,
                        {
                            filter:
                                `accountId = ${requestedId}`
                        }
                    );

            const avatar =
                result.items.length > 0
                    ? result.items[0]
                    : null;

            return res
                .status(200)
                .json(
                    normalizeAvatarRecord(
                        avatar
                    )
                );

        } catch (err) {

            console.error(
                "[ECON] Avatar lookup failed:",
                err.message
            );

            return res
                .status(500)
                .json({

                    error:
                        "Internal server error"
                });
        }
    }
);

// ---------------------------------------------------------
// GET /api/avatar/v1/defaultbaseavataritems
// ---------------------------------------------------------

router.get(
    "/api/avatar/v1/defaultbaseavataritems",
    (req, res) => {

        console.log(
            "[ECON] Default base avatar items requested"
        );

        return res
            .status(200)
            .json([]);
    }
);

// ---------------------------------------------------------
// GET /api/storefronts/v3/giftdropstore/:id
// ---------------------------------------------------------

router.get(
    "/api/storefronts/v3/giftdropstore/:id",
    (req, res) => {

        const storefrontId =
            Number(
                req.params.id
            );

        console.log(
            `[ECON] Gift-drop storefront requested - id=${storefrontId}`
        );

        if (
            !Number.isSafeInteger(
                storefrontId
            )
        ) {

            return res
                .status(400)
                .json({

                    error:
                        "Invalid storefrontId"
                });
        }

        // -------------------------------------------------
        // Try captured/static storefront response first
        // -------------------------------------------------

        const file2025 =
            path.join(
                __dirname,
                "blobs",
                `sf${storefrontId}-2025.json`
            );

        const fileNormal =
            path.join(
                __dirname,
                "blobs",
                `sf${storefrontId}.json`
            );

        if (
            fs.existsSync(
                file2025
            )
        ) {

            console.log(
                `[ECON] Serving storefront blob: ${file2025}`
            );

            return res.sendFile(
                file2025
            );
        }

        if (
            fs.existsSync(
                fileNormal
            )
        ) {

            console.log(
                `[ECON] Serving storefront blob: ${fileNormal}`
            );

            return res.sendFile(
                fileNormal
            );
        }

        // -------------------------------------------------
        // Temporary response for storefront 3
        // -------------------------------------------------
        //
        // This prevents the exact request from returning
        // 404 while the real captured storefront schema
        // is being reproduced.
        //

        if (
            storefrontId === 3 ||
            (
                storefrontId >= 2000 &&
                storefrontId <= 2004
            )
        ) {

            console.warn(
                `[ECON] No storefront blob for ID ${storefrontId}; returning temporary empty storefront`
            );

            return res
                .status(200)
                .json({

                    id:
                        storefrontId,

                    storefrontId:
                        storefrontId,

                    items:
                        []
                });
        }

        console.warn(
            `[ECON] Storefront ${storefrontId} not implemented`
        );

        return res
            .status(404)
            .json({

                error:
                    "Storefront not found",

                storefrontId:
                    storefrontId
            });
    }
);


// ---------------------------------------------------------
// GET /api/storefronts/v4/balance/:currencyType
// Compatibility probe for the 20231207 client.
// ---------------------------------------------------------

router.get(
    "/api/storefronts/v4/balance/:currencyType",
    (req, res) => {

        const currencyType =
            Number(req.params.currencyType);

        console.log(
            `[ECON] Balance requested - currencyType=${currencyType}`
        );

        return res
            .status(200)
            .json([]);
    }
);

// ---------------------------------------------------------
// GET /api/challenge/v2/getCurrent
// ---------------------------------------------------------

router.get("/api/challenge/v2/getCurrent", (req, res) => {
    console.log("[ECON] Current challenges requested");

    return res.status(200).json([]);
});

// =========================================================
// ROOM ECONOMY
// =========================================================

// ---------------------------------------------------------
// GET /econ/roomGiftDropShops/room/:roomId
// ---------------------------------------------------------

router.get(
    "/econ/roomGiftDropShops/room/:roomId",
    (req, res) => {
        const roomId =
            Number(req.params.roomId);

        console.log(
            `[ECON] Room gift-drop shops requested - roomId=${roomId}`
        );

        return res
            .status(200)
            .json([]);
    }
);

// ---------------------------------------------------------
// GET /econ/roomInventory/room/:roomId
// ---------------------------------------------------------

router.get(
    "/econ/roomInventory/room/:roomId",
    (req, res) => {
        const roomId =
            Number(req.params.roomId);

        console.log(
            `[ECON] Room inventory requested - roomId=${roomId}`
        );

        return res
            .status(200)
            .json([]);
    }
);

// ---------------------------------------------------------
// GET /econ/roomOffer/room/:roomId
// ---------------------------------------------------------

router.get(
    "/econ/roomOffer/room/:roomId",
    (req, res) => {
        const roomId =
            Number(req.params.roomId);

        console.log(
            `[ECON] Room offers requested - roomId=${roomId}`
        );

        return res
            .status(200)
            .json([]);
    }
);

// ---------------------------------------------------------
// GET /econ/roomInventory/room/:roomId/player
// ---------------------------------------------------------

router.get(
    "/econ/roomInventory/room/:roomId/player",
    (req, res) => {
        const roomId =
            Number(req.params.roomId);

        console.log(
            `[ECON] Player room inventory requested - roomId=${roomId}`
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// Temporary in-memory outfit storage
// ---------------------------------------------------------



// ---------------------------------------------------------
// PUT /outfits/me
// ---------------------------------------------------------

router.put("/outfits/me", (req, res) => {
    console.log("[ECON] Current outfit update requested");

    const accountId =
        Number(getAccountId(req));

    if (!Number.isSafeInteger(accountId)) {
        return res
            .status(401)
            .json({
                error: "Unauthorized"
            });
    }

    const outfit =
        req.body &&
        typeof req.body === "object"
            ? req.body
            : {};

    outfitByAccountId.set(
        accountId,
        outfit
    );

    console.log(
        `[ECON] Outfit saved in memory for accountId=${accountId}`
    );

    return res
        .status(200)
        .json(outfit);
});
module.exports = router;


