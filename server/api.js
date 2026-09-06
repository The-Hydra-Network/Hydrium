const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");

const pb = require("./pb");

const router = express.Router();

router.use(express.json());

const JWT_SECRET = process.env.HYDRIUM_JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("HYDRIUM_JWT_SECRET is not configured");
}

// ---------------------------------------------------------
// PocketBase collections
// ---------------------------------------------------------

const COLLECTIONS = pb.hydriumCollections;

// ---------------------------------------------------------
// Static response blobs
// ---------------------------------------------------------

const ALL_PATH = path.join(
    __dirname,
    "blobs",
    "all.json"
);

const VERSIONCHECK_PATH = path.join(
    __dirname,
    "blobs",
    "versioncheck.json"
);

const AMPLITUDE_PATH = path.join(
    __dirname,
    "blobs",
    "amplitude.json"
);


// ---------------------------------------------------------
// Authentication
// ---------------------------------------------------------

function getAccountId(req) {

    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
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

        return String(decoded.sub);

    } catch (err) {

        console.log(
            "[API] Invalid token:",
            err.message
        );

        return null;
    }
}


// ---------------------------------------------------------
// Find account by Rec Room accountId
// ---------------------------------------------------------
//
// Rec Room accountId:
//     12345
//
// PocketBase record ID:
//     abc123xyz...
//
// These are NOT the same thing.
//

async function getAccountById(accountId) {

    const numericId =
        Number(accountId);

    if (!Number.isSafeInteger(numericId)) {
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
// Game configs
// ---------------------------------------------------------

router.get(
    "/api/gameconfigs/v1/all",
    (req, res) => {

        console.log(
            "[API] Game configs requested"
        );

        res.set(
            "Cache-Control",
            "no-store"
        );

        return res.sendFile(
            ALL_PATH
        );
    }
);


// ---------------------------------------------------------
// Version check
// ---------------------------------------------------------

router.get(
    "/api/versioncheck/v4",
    (req, res) => {

        console.log(
            "[API] Version check requested"
        );

        console.log(
            "[API] Query:",
            req.query
        );

        return res.sendFile(
            VERSIONCHECK_PATH
        );
    }
);


// ---------------------------------------------------------
// Amplitude
// ---------------------------------------------------------

router.get(
    "/api/config/v1/amplitude",
    (req, res) => {

        console.log(
            "[API] Amplitude config requested"
        );

        res.set(
            "Cache-Control",
            "no-store"
        );

        return res.sendFile(
            AMPLITUDE_PATH
        );
    }
);


// ---------------------------------------------------------
// Moderation block details
// ---------------------------------------------------------

router.post(
    "/api/PlayerReporting/v1/moderationBlockDetails",
    async (req, res) => {

        console.log(
            "[API] Moderation block details requested"
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

            // Convert Rec Room accountId
            // to the PocketBase record.

            const account =
                await getAccountById(
                    accountId
                );


            const result =
                await pb
                    .collection(
                        COLLECTIONS.reports
                    )
                    .getList(
                        1,
                        1,
                        {
                            filter:
                                `account = "${account.id}"`,

                            sort:
                                "-created"
                        }
                    );


            if (
                result.items.length === 0
            ) {

                return res
                    .status(200)
                    .json({

                        Duration:
                            0,

                        GameSessionId:
                            0,

                        IsBan:
                            false,

                        IsHostKick:
                            false,

                        IsVoiceModAutoban:
                            false,

                        Message:
                            null,

                        PlayerIdReporter:
                            null,

                        ReportCategory:
                            -1,

                        TimeoutStartedAt:
                            null
                    });
            }


            const report =
                result.items[0];


            return res
                .status(200)
                .json({

                    Duration:
                        report.Duration ||
                        0,

                    GameSessionId:
                        report.GameSessionId ||
                        0,

                    IsBan:
                        Boolean(
                            report.banned
                        ),

                    IsHostKick:
                        Boolean(
                            report.IsHostKick
                        ),

                    IsVoiceModAutoban:
                        Boolean(
                            report.IsVoiceModAutoban
                        ),

                    Message:
                        report.Message ||
                        null,

                    PlayerIdReporter:
                        report.PlayerIdReporter ||
                        null,

                    ReportCategory:
                        report.ReportCategory ??
                        -1,

                    TimeoutStartedAt:
                        report.TimeoutStartedAt ||
                        null
                });

        } catch (err) {

            console.error(
                "[API] Moderation lookup failed:",
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
// Objectives
// ---------------------------------------------------------

router.get(
    "/api/objectives/v1/myprogress",
    async (req, res) => {

        console.log(
            "[API] Objectives progress requested"
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

            const account =
                await getAccountById(
                    accountId
                );


            const result =
                await pb
                    .collection(
                        COLLECTIONS.objectives
                    )
                    .getList(
                        1,
                        100,
                        {
                            filter:
                                `account = "${account.id}"`
                        }
                    );


            const progress = {};


            for (
                const objective
                of result.items
            ) {

                progress[
                    objective.objectiveId ||
                    objective.id
                ] =
                    objective.progress ||
                    {};
            }


            return res
                .status(200)
                .json(
                    progress
                );

        } catch (err) {

            console.error(
                "[API] Objectives error:",
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
// Player progression
// ---------------------------------------------------------

router.get(
    "/api/players/v2/progression/bulk",
    async (req, res) => {

        const ids =
            Array.isArray(req.query.id)
                ? req.query.id
                : req.query.id
                    ? [req.query.id]
                    : [];


        console.log(
            `[API] Player progression requested - ids=${ids.join(", ")}`
        );


        try {

            const progressions = [];


            for (
                const id
                of ids
            ) {

                const accountId =
                    String(id);


                let account;


                try {

                    account =
                        await getAccountById(
                            accountId
                        );

                } catch (err) {

                    progressions.push({

                        PlayerId:
                            Number(id),

                        Level:
                            1,

                        XP:
                            0
                    });

                    continue;
                }


                const result =
                    await pb
                        .collection(
                            COLLECTIONS.progression
                        )
                        .getList(
                            1,
                            1,
                            {
                                filter:
                                    `account = "${account.id}"`
                            }
                        );


                if (
                    result.items.length === 0
                ) {

                    progressions.push({

                        PlayerId:
                            Number(id),

                        Level:
                            1,

                        XP:
                            0
                    });

                    continue;
                }


                const progression =
                    result.items[0];


                progressions.push({

                    PlayerId:
                        Number(id),

                    Level:
                        progression.Level ??
                        1,

                    XP:
                        progression.XP ??
                        0
                });
            }


            return res
                .status(200)
                .json(
                    progressions
                );

        } catch (err) {

            console.error(
                "[API] Progression error:",
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
// Player reputation
// ---------------------------------------------------------

router.get(
    "/api/playerReputation/v2/bulk",
    async (req, res) => {

        const ids =
            Array.isArray(req.query.id)
                ? req.query.id
                : req.query.id
                    ? [req.query.id]
                    : [];


        console.log(
            `[API] Player reputation requested - ids=${ids.join(", ")}`
        );


        try {

            const reputations = [];


            for (
                const id
                of ids
            ) {

                const accountId =
                    String(id);


                let account;


                try {

                    account =
                        await getAccountById(
                            accountId
                        );

                } catch (err) {

                    reputations.push({

                        AccountId:
                            Number(id),

                        IsCheerful:
                            false,

                        Noteriety:
                            0,

                        SelectedCheer:
                            0,

                        CheerCredit:
                            0,

                        CheerGeneral:
                            0,

                        CheerHelpful:
                            0,

                        CheerCreative:
                            0,

                        CheerGreatHost:
                            0,

                        CheerSportsman:
                            0,

                        SubscriberCount:
                            0,

                        SubscribedCount:
                            0
                    });

                    continue;
                }


                const result =
                    await pb
                        .collection(
                            COLLECTIONS.reputation
                        )
                        .getList(
                            1,
                            1,
                            {
                                filter:
                                    `account = "${account.id}"`
                            }
                        );


                if (
                    result.items.length === 0
                ) {

                    reputations.push({

                        AccountId:
                            Number(id),

                        IsCheerful:
                            false,

                        Noteriety:
                            0,

                        SelectedCheer:
                            0,

                        CheerCredit:
                            0,

                        CheerGeneral:
                            0,

                        CheerHelpful:
                            0,

                        CheerCreative:
                            0,

                        CheerGreatHost:
                            0,

                        CheerSportsman:
                            0,

                        SubscriberCount:
                            0,

                        SubscribedCount:
                            0
                    });

                    continue;
                }


                const reputation =
                    result.items[0];


                reputations.push({

                    AccountId:
                        Number(id),

                    IsCheerful:
                        reputation.IsCheerful ??
                        false,

                    Noteriety:
                        reputation.Noteriety ??
                        0,

                    SelectedCheer:
                        reputation.SelectedCheer ??
                        0,

                    CheerCredit:
                        reputation.CheerCredit ??
                        0,

                    CheerGeneral:
                        reputation.CheerGeneral ??
                        0,

                    CheerHelpful:
                        reputation.CheerHelpful ??
                        0,

                    CheerCreative:
                        reputation.CheerCreative ??
                        0,

                    CheerGreatHost:
                        reputation.CheerGreatHost ??
                        0,

                    CheerSportsman:
                        reputation.CheerSportsman ??
                        0,

                    SubscriberCount:
                        reputation.SubscriberCount ??
                        0,

                    SubscribedCount:
                        reputation.SubscribedCount ??
                        0
                });
            }


            return res
                .status(200)
                .json(
                    reputations
                );

        } catch (err) {

            console.error(
                "[API] Reputation error:",
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
// Custom avatar creation permission
// ---------------------------------------------------------

router.get(
    "/api/customAvatarItems/v1/isCreationAllowedForAccount",
    (req, res) => {

        console.log(
            "[API] Custom avatar creation permission requested"
        );

        return res
            .status(200)
            .json({

                success:
                    true,

                value:
                    null
            });
    }
);


// ---------------------------------------------------------
// Legacy custom avatar saves
// ---------------------------------------------------------

router.post(
    "/api/customAvatarItems/GetCustomAvatarItemCurrentSavesForLegacyAvatarItems",
    async (req, res) => {

        console.log(
            "[API] Legacy custom avatar saves requested"
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

            const account =
                await getAccountById(
                    accountId
                );


            const result =
                await pb
                    .collection(
                        COLLECTIONS.customAvatarSaves
                    )
                    .getList(
                        1,
                        100,
                        {
                            filter:
                                `account = "${account.id}"`
                        }
                    );


            const saves = {};


            for (
                const item
                of result.items
            ) {

                const key =
                    item.avatarItemDesc ||
                    item.customAvatarItemId ||
                    item.id;


                saves[key] = {

                    customAvatarItemSaveId:
                        item.customAvatarItemSaveId ||
                        null,

                    unityAssetId:
                        item.unityAssetId ||
                        null,

                    unityAssetHash:
                        item.unityAssetHash ||
                        null,

                    thumbnailFileName:
                        item.thumbnailFileName ||
                        null,

                    additionalConfiguration:
                        item.additionalConfiguration ||
                        null
                };
            }


            return res
                .status(200)
                .json({

                    customAvatarItemSavesByAvatarItemDesc:
                        saves
                });

        } catch (err) {

            console.error(
                "[API] Custom avatar saves error:",
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
// Current outfit
// ---------------------------------------------------------

router.get(
    "/outfits/me",
    async (req, res) => {

        console.log(
            "[API] Current outfit requested"
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

            const account =
                await getAccountById(
                    accountId
                );


            const result =
                await pb
                    .collection(
                        COLLECTIONS.outfits
                    )
                    .getList(
                        1,
                        1,
                        {
                            filter:
                                `account = "${account.id}"`,

                            sort:
                                "slot"
                        }
                    );


            if (
                result.items.length === 0
            ) {

                return res
                    .status(200)
                    .json({

                        FaceFeatures:
                            "",

                        HairColor:
                            "",

                        OutfitSelections:
                            "",

                        SkinColor:
                            ""
                    });
            }


            const outfit =
                result.items[0];


            return res
                .status(200)
                .json({

                    FaceFeatures:
                        outfit.FaceFeatures ||
                        "",

                    HairColor:
                        outfit.HairColor ||
                        "",

                    OutfitSelections:
                        outfit.SelectionsV2 ??
                        outfit.SelectionsV1 ??
                        "",

                    SkinColor:
                        outfit.SkinColor ||
                        ""
                });

        } catch (err) {

            console.error(
                "[API] Outfit error:",
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


module.exports = router;