const express = require("express");
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
        "blobs",
        "avatar-items.json"
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

        LegacyData: {

            AvatarOutfit:
                0,

            SkinColor:
                0,

            HairColor:
                0,

            EyeColor:
                0,

            HatIndex:
                -1,

            GlassesIndex:
                -1,

            BeardIndex:
                -1,

            OutfitIndex:
                0,

            ShoeIndex:
                0
        }
    };
}

// ---------------------------------------------------------
// Normalize avatar record
// ---------------------------------------------------------

function normalizeAvatarRecord(
    record
) {

    if (!record) {

        return getDefaultAvatar();
    }

    const avatarData =
        record.data ??
        record.avatar ??
        record;

    if (
        !avatarData ||
        typeof avatarData !==
            "object" ||
        Array.isArray(
            avatarData
        ) ||
        avatarData.LegacyData ==
            null
    ) {

        console.warn(
            "[ECON] Avatar record has no LegacyData; using default avatar"
        );

        return getDefaultAvatar();
    }

    return avatarData;
}

// ---------------------------------------------------------
// GET /api/avatar/v4/items
// ---------------------------------------------------------

router.get(
    "/api/avatar/v4/items",
    (req, res) => {

        console.log(
            "[ECON] Avatar items requested"
        );

        return res.sendFile(
            AVATAR_ITEMS_PATH
        );
    }
);

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

router.get("/api/avatar/v2", async (req, res) => {
    try {
        const accountId = getAccountId(req);

        if (!accountId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });
        }

        const numericAccountId = Number(accountId);

        let record = null;

        try {
            record = await pb
                .collection("hydrium_avatar")
                .getFirstListItem(`accountId = ${numericAccountId}`);
        } catch (err) {
            if (err?.status !== 404) {
                throw err;
            }
        }

        // FIX: previously returned res.status(200).json({}) here.
        // The client's deserializer requires a populated LegacyData
        // field and throws "Malformed Response: '{}'" / "Deserialization
        // returned null" when it gets a bare empty object. Fall back to
        // a real default avatar instead.
        if (!record) {
            return res.status(200).json(getDefaultAvatar());
        }

        let avatar = record.data ?? record.avatar ?? {};

        if (typeof avatar === "string") {
            try {
                avatar = JSON.parse(avatar);
            } catch {
                avatar = {};
            }
        }

        // FIX: same reasoning — if what's stored is missing/malformed/
        // not an object, or has no LegacyData, fall back to a real
        // default avatar rather than an empty object, so the client
        // can always deserialize the response.
        if (
            !avatar ||
            typeof avatar !== "object" ||
            Array.isArray(avatar) ||
            avatar.LegacyData == null
        ) {
            avatar = getDefaultAvatar();
        }

        return res.status(200).json(avatar);

    } catch (err) {
        console.error("[ECON] GET /api/avatar/v2 failed:", err);

        return res.status(500).json({
            success: false,
            error: "Failed to load avatar"
        });
    }
});
// ---------------------------------------------------------
// POST /api/avatar/v2/set
// ---------------------------------------------------------

router.post(
    "/api/avatar/v2/set",
    async (req, res) => {

        console.log(
            "[ECON] Avatar v2 set requested"
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

            const existing =
                await pb
                    .collection(
                        AVATAR_COLLECTION
                    )
                    .getList(
                        1,
                        1,
                        {
                            filter:
                                `accountId = ${numericAccountId}`
                        }
                    );

            const data = {

                accountId:
                    numericAccountId,

                data:
                    req.body
            };

            if (
                existing.items.length >
                0
            ) {

                await pb
                    .collection(
                        AVATAR_COLLECTION
                    )
                    .update(
                        existing.items[0].id,
                        data
                    );

            } else {

                await pb
                    .collection(
                        AVATAR_COLLECTION
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
                "[ECON] Avatar v2 save failed:",
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
            storefrontId === 3
        ) {

            console.warn(
                "[ECON] No storefront blob for ID 3; returning temporary empty storefront"
            );

            return res
                .status(200)
                .json({

                    id:
                        3,

                    storefrontId:
                        3,

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

module.exports = router;