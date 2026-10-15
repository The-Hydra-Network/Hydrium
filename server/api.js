const express = require("express");

const {
    outfitByAccountId
} = require("./state");
const path = require("path");
const jwt = require("jsonwebtoken");
const fs = require("fs");

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
// GET /api/gameconfigs/v1/all
// ---------------------------------------------------------

router.get("/api/gameconfigs/v1/all", (req, res) => {
    console.log("[API] All GameConfigs requested");

    return res.status(200).json([
        {
            Key: "UGC.ObjectModel.Allowed",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.AllowedInRoomV1",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.RoomUpgrade",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.Clone",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.Copy",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.Undo",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.UndoCreation",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.Physics",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.SerializationV4",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.HierarchyViewVisible",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.InventionLoading",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.RoomSaving",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.RoomPublishing",
            Value: "true"
        },
        {
            Key: "UGC.ObjectModel.NetworkSnapshot",
            Value: "true"
        },

        {
            Key: "Debug.AdditionalLogFlags",
            Value: "CircuitsV2Lifecycle"
        },
        {
            Key: "Debug.TraceProbability",
            Value: "1"
        },
        {
            Key: "Debug.AdditionalTraceFlags",
            Value: "None"
        },

        {
            Key: "Backtrace.config",
            Value: "0|0.05|0|20|50|1|0|0|1000"
        },
        {
            Key: "Backtrace.enabledLikelihood",
            Value: "1.0|1.0|1.0|1.0|1.0|1.0|1.0|1.0"
        },
        {
            Key: "Backtrace.versionRegex",
            Value: ".*"
        },
        {
            Key: "Backtrace.messageRegex",
            Value:
                "^Cannot set the parent of the GameObject .* while its new parent|^\\>\\x2010x\\:\\x20|\\'LabelTheme\\' contains missing PaletteTheme reference on"
        },
        {
            Key: "Backtrace.stopTimeUTC",
            Value: "9999-09-28 23:55"
        },
        {
            Key: "Backtrace.deobfuscationRate",
            Value: "1.0"
        }
    ]);
});

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
// Checklist
// ---------------------------------------------------------

router.get(
    "/api/checklist/v1/current",
    (req, res) => {

        console.log(
            "[API] Current checklist requested"
        );

        return res
            .status(200)
            .json([]);
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

            const objectives =
                result.items.map(
                    objective =>
                        objective.progress ??
                        objective
                );

            return res
                .status(200)
                .json({
                    Objectives:
                        objectives,

                    ObjectiveGroups:
                        []
                });

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

        const numericAccountId =
            Number(accountId);

        const memoryOutfit =
            outfitByAccountId.get(
                numericAccountId
            );

        if (memoryOutfit) {
            console.log(
                `[API] Current outfit loaded from shared memory for accountId=${numericAccountId}`
            );

            return res
                .status(200)
                .json(memoryOutfit);
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

                console.log(
                    "[API] No stored outfit - returning clean default"
                );

                return res
                    .status(200)
                    .json({

                        LegacyData: {

                            SelectionsV1:
                                null,

                            SelectionsV2:
                                null,

                            FaceFeatures:
                                null,

                            SkinColor:
                                null,

                            HairColor:
                                null
                        },

                        Selections:
                            [],

                        DataVersion:
                            9,

                        CustomizationSettings:
                            null,

                        ThumbnailFileName:
                            null,

                        Name:
                            null,

                        Accessibility:
                            0,

                        Slot:
                            0
                    });
            }


            const outfit =
                result.items[0];


            const normalizeNullable =
                (value) => {

                    if (
                        value === undefined ||
                        value === null ||
                        value === ""
                    ) {
                        return null;
                    }

                    return value;
                };


            const response = {

                LegacyData: {

                    SelectionsV1:
                        normalizeNullable(
                            outfit.SelectionsV1
                        ),

                    SelectionsV2:
                        normalizeNullable(
                            outfit.SelectionsV2
                        ),

                    FaceFeatures:
                        normalizeNullable(
                            outfit.FaceFeatures
                        ),

                    SkinColor:
                        normalizeNullable(
                            outfit.SkinColor
                        ),

                    HairColor:
                        normalizeNullable(
                            outfit.HairColor
                        )
                },

                Selections:
                    [],

                DataVersion:
                    9,

                CustomizationSettings:
                    null,

                ThumbnailFileName:
                    null,

                Name:
                    null,

                Accessibility:
                    0,

                Slot:
                    Number.isSafeInteger(
                        Number(outfit.slot)
                    )
                        ? Number(outfit.slot)
                        : 0
            };


            console.log(
                "[API] Outfit response:",
                JSON.stringify(response)
            );


            return res
                .status(200)
                .json(
                    response
                );

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


// ---------------------------------------------------------
// Relationships
// ---------------------------------------------------------

router.get(
    "/api/relationships/v2/get",
    (req, res) => {

        console.log(
            "[API] Relationships requested"
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// POST /statsigUserProperties
// ---------------------------------------------------------

router.post(
    "/statsigUserProperties",
    (req, res) => {
        console.log("");
        console.log("========================================");
        console.log("[STATSIG] USER PROPERTIES");
        console.log("========================================");
        console.log(
            "[STATSIG] Body:",
            JSON.stringify(
                req.body,
                null,
                2
            )
        );
        console.log("========================================");
        console.log("");

        return res.status(200).json({});
    }
);

// =========================================================
// QUICK PLAY
// GET /api/quickPlay/v1/getandclear
// =========================================================

router.get(
    "/api/quickPlay/v1/getandclear",
    (req, res) => {

        console.log(
            "[API] QuickPlay get-and-clear requested"
        );

        console.log(
            "[API] Query:",
            req.query
        );

        return res.status(200).json({
    HasDestination: false,
    RoomId: null,
    RoomName: null,
    RoomInstanceId: null,
    Query: null
});
    }
);


// =========================================================
// BACKTRACE CONFIG
// GET /api/config/v1/backtrace
// =========================================================

router.get("/api/config/v1/backtrace", (req, res) => {
    console.log("[API] Backtrace config requested");
    console.log("[API] platformType:", req.query.platformType);
    console.log("[API] allocate:", req.query.allocate);

    return res.status(200).json({
        ANRThresholdMs: 0,
        CaptureNativeCrashes: 0,
        FilterType: 0,
        LogLineCount: 0,
        MessageCount: 0,
        MessageRegex: "",
        ReportBudget: 0,
        SampleRate: 0.0,
        VersionRegex: ""
    });
});

// =========================================================
// BULK IGNORE PLATFORM USERS
// POST /api/relationships/v1/bulkignoreplatformusers
// =========================================================

router.post(
    "/api/relationships/v1/bulkignoreplatformusers",
    (req, res) => {

        console.log(
            "[API] Bulk ignore platform users requested"
        );

        console.log(
            "[API] Body:",
            JSON.stringify(
                req.body,
                null,
                2
            )
        );

        return res
            .status(200)
            .json([]);
    }
);


// =========================================================
// SIGS / VERIFICATION FILES
// GET /sigs/:id
// =========================================================
//
// IMPORTANT:
//
// The client reported:
//
// Type 311:
//     Array cannot be null.
//     Parameter name: bytes
//
// after receiving an empty response.
//
// Returning arbitrary "{}" bytes changed that to:
//
// Type 310:
//     Failed to process verification file:Internal Error
//
// Therefore /sigs/:id is treated as a real binary
// verification file.
//
// We now ONLY serve an actual file from:
//
//     <Hydrium>/sigs/<uuid>
//
// No fabricated contents.
//

router.get(
    "/sigs/:id",
    (req, res) => {

        const sigId =
            String(
                req.params.id || ""
            );

        // Only permit UUID-like / safe file-name characters.
        // Prevents path traversal through this endpoint.
        if (
            !/^[A-Za-z0-9_-]+$/.test(
                sigId
            )
        ) {

            console.log(
                `[API] Invalid signature id - ${sigId}`
            );

            return res
                .status(400)
                .send();
        }


        const sigPath =
            path.join(
                __dirname,
                "sigs",
                sigId
            );


        console.log(
            `[API] Signature requested - id=${sigId}`
        );

        console.log(
            `[API] Signature path - ${sigPath}`
        );


        if (
            !fs.existsSync(
                sigPath
            )
        ) {

            console.log(
                `[API] Verification file MISSING - id=${sigId}`
            );

            return res
                .status(404)
                .send();
        }


        try {

            const stat =
                fs.statSync(
                    sigPath
                );

            if (
                !stat.isFile()
            ) {

                console.log(
                    `[API] Verification path is not a file - id=${sigId}`
                );

                return res
                    .status(404)
                    .send();
            }


            const payload =
                fs.readFileSync(
                    sigPath
                );


            if (
                payload.length === 0
            ) {

                console.log(
                    `[API] Verification file is EMPTY - id=${sigId}`
                );

                return res
                    .status(500)
                    .send();
            }


            console.log(
                `[API] Verification file loaded - id=${sigId}, bytes=${payload.length}`
            );


            res.set(
                "Content-Type",
                "application/octet-stream"
            );

            res.set(
                "Content-Length",
                String(
                    payload.length
                )
            );

            res.set(
                "Cache-Control",
                "no-store"
            );


            return res
                .status(200)
                .send(
                    payload
                );

        } catch (err) {

            console.error(
                `[API] Failed reading verification file - id=${sigId}:`,
                err.message
            );

            return res
                .status(500)
                .send();
        }
    }
);


// =========================================================
// LOADING SCREEN TIP DATA
// GET /config/LoadingScreenTipData
// =========================================================

router.get(
    "/config/LoadingScreenTipData",
    (req, res) => {
        const tipsPath = path.join(
            __dirname,
            "blobs",
            "loading-tips.json"
        );

        console.log(
            `[API] LoadingScreenTipData requested - ${tipsPath}`
        );

        if (!fs.existsSync(tipsPath)) {
            return res.status(200).json([]);
        }

        try {
            const tips = JSON.parse(
                fs.readFileSync(tipsPath, "utf8")
            );

            return res.status(200).json(
                Array.isArray(tips) ? tips : []
            );
        } catch (err) {
            console.error(
                "[API] Failed loading screen tips:",
                err.message
            );

            return res.status(200).json([]);
        }
    }
);

// =========================================================
// API CONFIG V2
// GET /api/config/v2
// =========================================================

router.get("/api/config/v2", (req, res) => {
    console.log("[API] Config V2 requested");

    return res.status(200).json({
        MessageOfTheDay: "Welcome to Hydrium!",

        CdnBaseUri:
            "https://cdn-hydrium.hydranet.dpdns.org/",

        ShareBaseUrl:
            "https://api-hydrium.hydranet.dpdns.org/share/0",

        LevelProgressionMaps: [
            {
                Level: 0,
                RequiredXp: 1,
                GiftDropId: null
            },
            {
                Level: 1,
                RequiredXp: 2,
                GiftDropId: 0
            },
            {
                Level: 2,
                RequiredXp: 3,
                GiftDropId: 0
            },
            {
                Level: 3,
                RequiredXp: 4,
                GiftDropId: 0
            },
            {
                Level: 4,
                RequiredXp: 5,
                GiftDropId: 0
            },
            {
                Level: 5,
                RequiredXp: 6,
                GiftDropId: 0
            },
            {
                Level: 6,
                RequiredXp: 7,
                GiftDropId: 0
            },
            {
                Level: 7,
                RequiredXp: 8,
                GiftDropId: 0
            },
            {
                Level: 8,
                RequiredXp: 9,
                GiftDropId: 0
            },
            {
                Level: 9,
                RequiredXp: 10,
                GiftDropId: 0
            },
            {
                Level: 10,
                RequiredXp: 11,
                GiftDropId: 0
            },
            {
                Level: 11,
                RequiredXp: 12,
                GiftDropId: 0
            },
            {
                Level: 12,
                RequiredXp: 13,
                GiftDropId: 0
            },
            {
                Level: 13,
                RequiredXp: 14,
                GiftDropId: 0
            },
            {
                Level: 14,
                RequiredXp: 15,
                GiftDropId: 0
            },
            {
                Level: 15,
                RequiredXp: 16,
                GiftDropId: 0
            },
            {
                Level: 16,
                RequiredXp: 17,
                GiftDropId: 0
            },
            {
                Level: 17,
                RequiredXp: 18,
                GiftDropId: 0
            },
            {
                Level: 18,
                RequiredXp: 19,
                GiftDropId: 0
            },
            {
                Level: 19,
                RequiredXp: 20,
                GiftDropId: 0
            },
            {
                Level: 20,
                RequiredXp: 21,
                GiftDropId: 0
            }
        ],

        MatchmakingParams: {
            PreferFullRoomsFrequency: 1.0,
            PreferEmptyRoomsFrequency: 0.0
        },

        DailyObjectives: [
            [
                {
                    Type: 20,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 21,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 22,
                    Score: 1,
                    Xp: 200
                }
            ],
            [
                {
                    Type: 20,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 21,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 22,
                    Score: 1,
                    Xp: 200
                }
            ],
            [
                {
                    Type: 20,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 21,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 22,
                    Score: 1,
                    Xp: 200
                }
            ],
            [
                {
                    Type: 20,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 21,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 22,
                    Score: 1,
                    Xp: 200
                }
            ],
            [
                {
                    Type: 20,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 21,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 22,
                    Score: 1,
                    Xp: 200
                }
            ],
            [
                {
                    Type: 20,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 21,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 22,
                    Score: 1,
                    Xp: 200
                }
            ],
            [
                {
                    Type: 20,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 21,
                    Score: 1,
                    Xp: 200
                },
                {
                    Type: 22,
                    Score: 1,
                    Xp: 200
                }
            ]
        ],

        ServerMaintainence: {
            StartsInMinutes: 0
        },

        AutoMicMutingConfig: {
            MicSpamVolumeThreshold: 10.0,
            MicVolumeSampleInterval: 1.0,
            MicVolumeSampleRollingWindowLength: 15.0,
            MicSpamSamplePercentageForWarning: 100.0,
            MicSpamSamplePercentageForWarningToEnd: 0.0,
            MicSpamSamplePercentageForForceMute: 500.0,
            MicSpamSamplePercentageForForceMuteToEnd: 0.0,
            MicSpamWarningStateVolumeMultiplier: 10.0
        },

        StorefrontConfig: {
            MinPlayerLevelForGifting: 0
        },

        RoomKeyConfig: {
            MaxKeysPerRoom: 100
        },

        RoomCurrencyConfig: {
            AwardCurrencyCooldownSeconds: 10.0
        },

        ConfigTable: [
            {
                Key: "Gift.DropChance",
                Value: "1"
            },
            {
                Key: "Gift.XP",
                Value: "0.5"
            }
        ],

        PhotonConfig: {
            CloudRegion: "us",
            CrcCheckEnabled: false,
            EnableServerTracingAfterDisconnect: false
        }
    });
});

// =========================================================
// POST /api/PlayerReporting/v1/hile
// =========================================================

router.post(
    "/api/PlayerReporting/v1/hile",
    (req, res) => {
        console.log("");
        console.log(
            "========================================"
        );
        console.log(
            "[API] PLAYER REPORTING HILE"
        );
        console.log(
            "========================================"
        );

        console.log(
            "[API] Body:",
            JSON.stringify(
                req.body,
                null,
                2
            )
        );

        console.log(
            "[API] HILE Type:",
            req.body?.Type ??
            req.body?.type ??
            null
        );

        console.log(
            "[API] HILE Message:",
            req.body?.Message ??
            req.body?.message ??
            null
        );

        console.log(
            "========================================"
        );
        console.log("");

        // FemRec original:
        // return Ok(false);
        return res
            .status(200)
            .json(false);
    }
);

// =========================================================
// PLAYER
// GET /Player?id=123726795
// =========================================================

router.get(
    "/Player",
    async (req, res) => {

        const playerId = Number(req.query.id);

        console.log(
            `[API] Player requested - id=${req.query.id}`
        );

        if (!Number.isSafeInteger(playerId)) {
            return res
                .status(400)
                .json([]);
        }

        try {

            const account =
                await getAccountById(playerId);

            const response = [
                {
                    Id: playerId,

                    Username:
                        account.username ||
                        account.Username ||
                        `Player${playerId}`,

                    DisplayName:
                        account.displayName ||
                        account.DisplayName ||
                        account.username ||
                        account.Username ||
                        `Player${playerId}`
                }
            ];

            console.log(
                "[API] Player response:",
                JSON.stringify(response)
            );

            return res
                .status(200)
                .json(response);

        } catch (err) {

            console.log(
                `[API] Player ${playerId} not found - returning fallback`
            );

            const response = [
                {
                    Id: playerId,
                    Username: `Player${playerId}`,
                    DisplayName: `Player${playerId}`
                }
            ];

            console.log(
                "[API] Player fallback response:",
                JSON.stringify(response)
            );

            return res
                .status(200)
                .json(response);
        }
    }
);

// =========================================================
// IMAGES - UPLOAD SAVED
// POST /api/images/v4/uploadsaved
// =========================================================

router.post(
    "/api/images/v4/uploadsaved",
    (req, res) => {

        console.log("");
        console.log("========================================");
        console.log("[API] IMAGE UPLOAD SAVED");
        console.log("========================================");

        console.log(
            "[API] Content-Type:",
            req.headers["content-type"]
        );

        console.log(
            "[API] Body:",
            JSON.stringify(req.body, null, 2)
        );

        console.log("========================================");
        console.log("");

        router.post(
    "/api/images/v4/uploadsaved",

    express.raw({
        type: () => true,
        limit: "25mb"
    }),

    (req, res) => {
        const accountId =
            Number(getAccountId(req));

        const bytes =
            Buffer.isBuffer(req.body)
                ? req.body.length
                : 0;

        const imageName =
            `avatar-${accountId}-${Date.now()}.png`;

        console.log(
            `[API] Saved avatar image received - accountId=${accountId}, bytes=${bytes}, imageName=${imageName}`
        );

        return res.status(200).json({
            ImageName: imageName,
            ThumbnailFileName: imageName,
            Success: true
        });
    }
);
    }
);

// =========================================================
// HYDRIUM / REC26 - 20231207 STARTUP COMPATIBILITY ENDPOINTS
// =========================================================
//
// Endpoints observados diretamente no cliente 20231207.
// Respostas ainda não confirmadas são compatibility probes.
// Player.log decidirá os contratos finais.
// =========================================================


// ---------------------------------------------------------
// UGC PURCHASABLES
// GET /api/ugcPurchasables/v1/items/room/:roomId
// ---------------------------------------------------------

router.get(
    "/api/ugcPurchasables/v1/items/room/:roomId",
    (req, res) => {

        const roomId =
            Number(req.params.roomId);

        console.log(
            `[API] UGC purchasables requested - roomId=${req.params.roomId}`
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// VOTE TO KICK REASONS
// GET /api/PlayerReporting/v1/voteToKickReasons
// ---------------------------------------------------------

router.get(
    "/api/PlayerReporting/v1/voteToKickReasons",
    (req, res) => {

        console.log(
            "[API] Vote-to-kick reasons requested"
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// GAME SERVER REGION PINGS
// PUT /player/gameserverregionpings
// ---------------------------------------------------------

router.put(
    "/player/gameserverregionpings",
    (req, res) => {

        console.log(
            "[API] Game server region pings received:",
            req.body
        );

        return res
            .status(200)
            .send();
    }
);


// ---------------------------------------------------------
// SAVED OUTFITS
// GET /outfits/me/saved
// ---------------------------------------------------------

router.get(
    "/outfits/me/saved",
    (req, res) => {

        console.log(
            "[API] Saved outfits requested"
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// EQUIPMENT
// GET /api/equipment/v2/getUnlocked
// ---------------------------------------------------------

router.get(
    "/api/equipment/v2/getUnlocked",
    (req, res) => {

        console.log(
            "[API] Unlocked equipment requested"
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// STATUS VISIBILITY
// PUT /player/statusvisibility
// ---------------------------------------------------------

router.put(
    "/player/statusvisibility",
    (req, res) => {

        console.log(
            "[API] Status visibility update:",
            req.body
        );

        return res
            .status(200)
            .send();
    }
);


// ---------------------------------------------------------
// CONSUMABLES
// GET /api/consumables/v2/getUnlocked
// ---------------------------------------------------------

router.get(
    "/api/consumables/v2/getUnlocked",
    (req, res) => {

        console.log(
            "[API] Unlocked consumables requested"
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// ROOMS CREATED BY ME
// GET /rooms/createdby/me
// ---------------------------------------------------------

router.get(
    "/rooms/createdby/me",
    (req, res) => {

        console.log(
            "[ROOMS] Rooms created by me requested"
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// NAMED IMAGES
// GET /api/images/v2/named
// ---------------------------------------------------------

router.get(
    "/api/images/v2/named",
    (req, res) => {

        console.log(
            "[API] Named images requested:",
            req.query
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// PENDING GAME REWARDS
// GET /api/gamerewards/v1/pending
// ---------------------------------------------------------

router.get(
    "/api/gamerewards/v1/pending",
    (req, res) => {

        console.log(
            "[API] Pending game rewards requested"
        );

        return res
            .status(200)
            .json([]);
    }
);


// ---------------------------------------------------------
// PLAYER EVENTS
// GET /api/playerevents/v1/all
// ---------------------------------------------------------

router.get(
    "/api/playerevents/v1/all",
    (req, res) => {

        console.log(
            "[API] Player events requested"
        );

        return res.status(200).json({
            Created: [],
            Responses: []
        });
    }
);

// ---------------------------------------------------------
// COMMUNITY BOARD
// GET /api/communityboard/v2/current
// ---------------------------------------------------------

router.get(
    "/api/communityboard/v2/current",
    (req, res) => {
        console.log(
            "[API] Current community board requested"
        );

        return res.status(200).json({
            IsActive: false,
            BoardId: 0,
            Entries: [],
            Results: []
        });
    }
);


// ---------------------------------------------------------
// ROOM KEYS
// GET /api/roomkeys/v1/mine
// ---------------------------------------------------------

router.get(
    "/api/roomkeys/v1/mine",
    (req, res) => {

        console.log(
            "[API] My room keys requested"
        );

        return res
            .status(200)
            .json([]);
    }
);

// GET /api/storefronts/v4/balance/:currencyType
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

// =========================================================
// POST /api/CampusCard/v1/UpdateAndGetSubscription
// =========================================================

router.post(
    "/api/CampusCard/v1/UpdateAndGetSubscription",
    (req, res) => {
        console.log(
            "[API] Campus Card subscription requested:",
            req.body
        );

        // O cliente 20231207 espera um JSON booleano,
        // não um objeto {}.
        return res
            .status(200)
            .json(false);
    }
);

// ---------------------------------------------------------
// SUBSCRIPTION SEASON
// GET /api/subscriptionseasons/v1/seasons/current
// ---------------------------------------------------------

router.get(
    "/api/subscriptionseasons/v1/seasons/current",
    (req, res) => {

        console.log(
            "[API] Current subscription season requested"
        );

        return res.status(200).json({
    IsActive: false,
    SeasonId: 0,
    Name: "",
    StartDate: null,
    EndDate: null,
    Rewards: []
});;
    }
);


// ---------------------------------------------------------
// CUSTOM AVATAR RENDERING
// GET /api/customAvatarItems/v1/isRenderingEnabled
// ---------------------------------------------------------

router.get(
    "/api/customAvatarItems/v1/isRenderingEnabled",
    (req, res) => {

        console.log(
            "[API] Custom avatar rendering flag requested"
        );

        return res
            .status(200)
            .json(false);
    }
);


// ---------------------------------------------------------
// CUSTOM AVATAR CREATION
// GET /api/customAvatarItems/v1/isCreationEnabled
// ---------------------------------------------------------

router.get(
    "/api/customAvatarItems/v1/isCreationEnabled",
    (req, res) => {

        console.log(
            "[API] Custom avatar creation flag requested"
        );

        return res
            .status(200)
            .json(false);
    }
);


// ---------------------------------------------------------
// AZURE SPEECH CONFIG
// GET /api/config/v1/azurespeech
// ---------------------------------------------------------

router.get(
    "/api/config/v1/azurespeech",
    (req, res) => {

        console.log(
            "[API] Azure Speech config requested"
        );

        return res.status(200).json({
    Enabled: false,
    IsEnabled: false,
    Region: "",
    SubscriptionKey: "",
    Endpoint: "",
    Token: ""
});
    }
);


// =========================================================
// ROOMS BULK
// GET /rooms/bulk?id=1
// =========================================================

router.get(
    "/rooms/bulk",
    (req, res) => {

        const rawIds =
            Array.isArray(req.query.id)
                ? req.query.id
                : req.query.id !== undefined
                    ? [req.query.id]
                    : [];

        const ids =
            rawIds
                .map(
                    id => Number(id)
                )
                .filter(
                    id => Number.isSafeInteger(id)
                );

        console.log(
            `[ROOMS] Bulk requested - ids=${ids.join(",")}`
        );


        const rooms = [];


        for (const roomId of ids) {

            if (roomId !== 1) {

                console.log(
                    `[ROOMS] Unknown room requested - id=${roomId}`
                );

                continue;
            }


            rooms.push({

                RoomId:
                    1,

                Name:
                    "DormRoom",

                Description:
                    "A private room.",

                CreatorAccountId:
                    0,

                ImageName:
                    null,

                State:
                    0,

                Accessibility:
                    1,

                SupportsLevelVoting:
                    false,

                IsAGRoom:
                    true,

                CloningAllowed:
                    false,

                SupportsScreens:
                    true,

                SupportsWalkVR:
                    true,

                SupportsTeleportVR:
                    true,

                ReplicationId:
                    "DormRoom",

                ReleaseStatus:
                    2,

                Scenes: [
                    {
                        RoomSceneId: 1,
                        RoomId: 1,
                        RoomSceneLocationId:
                            "76d98498-60a1-430c-ab76-b54a29b7a163",
                        Name: "dormroom2",
                        IsSandbox: false,
                        DataBlobName: "",
                        MaxPlayers: 20,
                        CanMatchmakeInto: true,
                        ReplicationId: "DormRoom",
                        UseLevelBasedMatchmaking: false,
                        UseAgeBasedMatchmaking: false,
                        UseRecRoyaleMatchmaking: false,
                        ReleaseStatus: 2,
                        SupportsJoinInProgress: true
                    }
                ],

                CoOwners: [],
                InvitedCoOwners: [],
                Hosts: [],
                InvitedHosts: []
            });
        }


        console.log(
            "[ROOMS] Bulk response:",
            JSON.stringify(rooms)
        );


        return res
            .status(200)
            .json(rooms);
    }
);

// =========================================================
// GET /rooms/:roomId
// Modelo baseado no FemRec 2023
// =========================================================

router.get(
    "/rooms/:roomId",
    (req, res) => {
        const roomId =
            Number(req.params.roomId);

        console.log(
            `[ROOMS] Room details requested - roomId=${roomId}`
        );

if (roomId === 13) {
    const orientationRoom = {
        RoomId: 13,

        IsDorm: false,
        MaxPlayerCalculationMode: 0,
        MaxPlayers: 1,

        CloningAllowed: false,
        DisableMicAutoMute: false,
        DisableRoomComments: true,
        EncryptVoiceChat: false,
        ToxmodEnabled: true,
        LoadScreenLocked: false,

        PersistenceVersion: 0,
        AutoLocalizeRoom: false,
        IsDeveloperOwned: true,

        Name: "Orientation",
        Description:
            "An introductory tour of Rec Room!",
        ImageName: "Orientation.jpg",

        WarningMask: 0,
        CustomWarning: null,
        CreatorAccountId: 2,

        State: 0,
        Accessibility: 1,

        SupportsLevelVoting: false,
        IsRRO: true,

        SupportsScreens: true,
        SupportsWalkVR: true,
        SupportsTeleportVR: true,
        SupportsVRLow: true,
        SupportsQuest2: true,
        SupportsMobile: true,
        SupportsJuniors: true,

        MinLevel: 0,
        CreatedAt: "2023-01-01T00:00:00Z",

        Stats: {
            CheerCount: 0,
            FavoriteCount: 0,
            VisitorCount: 0,
            VisitCount: 0
        },

        RankedEntityId: "13",
        RankingContext: null,

        SubRooms: [
            {
                SubRoomId: 23,
                RoomId: 13,
                Name: "Home",
                DataBlob: null,
                IsSandbox: false,
                MaxPlayers: 1,
                Accessibility: 1,

                UnitySceneId:
                    "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",

                SavedByAccountId: 0
            }
        ],

        Scenes: [
            {
                RoomSceneId: 23,
                RoomId: 13,

                RoomSceneLocationId:
                    "c79709d8-a31b-48aa-9eb8-cc31ba9505e8",

                Name: "Home",
                IsSandbox: false,
                DataBlobName: "",
                MaxPlayers: 1,
                CanMatchmakeInto: true,

                ReplicationId: "Orientation",

                UseLevelBasedMatchmaking: false,
                UseAgeBasedMatchmaking: false,
                UseRecRoyaleMatchmaking: false,

                ReleaseStatus: 2,
                SupportsJoinInProgress: true
            }
        ],

        Roles: [],
        DataBlob: null,
        UgcVersion: 1,

        Tags: [
            {
                Tag: "rro",
                Type: 0
            }
        ],

        PromoImages: [],
        PromoExternalContent: [],
        LoadScreens: []
    };

    console.log(
        "[ROOMS] Orientation details response:",
        JSON.stringify(orientationRoom)
    );

    return res
        .status(200)
        .json(orientationRoom);
}

        if (
            !Number.isSafeInteger(roomId) ||
            roomId !== 1
        ) {
            return res
                .status(404)
                .json({
                    error:
                        "Room not found"
                });
        }

        const room = {
            RoomId:
                1,

            IsDorm:
                true,

            MaxPlayerCalculationMode:
                0,

            MaxPlayers:
                1,

            CloningAllowed:
                false,

            DisableMicAutoMute:
                false,

            DisableRoomComments:
                false,

            EncryptVoiceChat:
                false,

            ToxmodEnabled:
                false,

            LoadScreenLocked:
                false,

            PersistenceVersion:
                88,

            AutoLocalizeRoom:
                false,

            IsDeveloperOwned:
                true,

            Name:
                "DormRoom",

            Description:
                "A private room.",

            ImageName:
                "",

            WarningMask:
                0,

            CustomWarning:
                null,

            CreatorAccountId:
                0,

            State:
                0,

            // Private no enum do FemRec.
            Accessibility:
                0,

            SupportsLevelVoting:
                false,

            IsRRO:
                true,

            SupportsScreens:
                true,

            SupportsWalkVR:
                true,

            SupportsTeleportVR:
                true,

            SupportsVRLow:
                true,

            SupportsQuest2:
                true,

            SupportsMobile:
                true,

            SupportsJuniors:
                true,

            MinLevel:
                0,

            CreatedAt:
                "2023-01-01T00:00:00Z",

            Stats: {
                CheerCount:
                    0,

                FavoriteCount:
                    0,

                VisitorCount:
                    0,

                VisitCount:
                    0
            },

            RankedEntityId:
                null,

            RankingContext:
                null,

            SubRooms: [
                {
                    SubRoomId:
                        1,

                    RoomId:
                        1,

                    Name:
                        "dormroom2",

                    DataBlob:
                        null,

                    IsSandbox:
                        false,

                    MaxPlayers:
                        1,

                    Accessibility:
                        0,

                    UnitySceneId:
                        "76d98498-60a1-430c-ab76-b54a29b7a163",

                    SavedByAccountId:
                        0
                }
            ],

Scenes: [
    {
        RoomSceneId:
            1,

        RoomId:
            1,

        RoomSceneLocationId:
            "76d98498-60a1-430c-ab76-b54a29b7a163",

        Name:
            "dormroom2",

        IsSandbox:
            false,

        DataBlobName:
            "",

        MaxPlayers:
            1,

        CanMatchmakeInto:
            true,

        ReplicationId:
            "DormRoom",

        UseLevelBasedMatchmaking:
            false,

        UseAgeBasedMatchmaking:
            false,

        UseRecRoyaleMatchmaking:
            false,

        ReleaseStatus:
            2,

        SupportsJoinInProgress:
            true
    }
],

            Roles:
                [],

            DataBlob:
                null,

            UgcVersion:
                0,

            Tags:
                [],

            PromoImages:
                [],

            PromoExternalContent:
                [],

            LoadScreens:
                []
        };

        console.log(
            "[ROOMS] Room details response:",
            JSON.stringify(room)
        );

        return res
            .status(200)
            .json(room);
    }
);

// ROOM CONSUMABLES
// GET /api/roomconsumables/v1/roomConsumable/room/:roomId
// =========================================================
//
// 20231207 compatibility probe.
// No room consumables exist yet in Hydrium.
// =========================================================

router.get(
    "/api/roomconsumables/v1/roomConsumable/room/:roomId",
    (req, res) => {

        const roomId =
            Number(req.params.roomId);

        console.log(
            `[API] Room consumables requested - roomId=${req.params.roomId}`
        );

        if (!Number.isSafeInteger(roomId)) {

            return res
                .status(400)
                .json([]);
        }

        return res
            .status(200)
            .json([]);
    }
);


// =========================================================
// ROOM CURRENCIES
// GET /api/roomcurrencies/v1/currencies?roomId=1
// =========================================================
//
// 20231207 compatibility probe.
// No custom room currencies exist yet in Hydrium.
// =========================================================

router.get(
    "/api/roomcurrencies/v1/currencies",
    (req, res) => {

        const roomId =
            Number(req.query.roomId);

        console.log(
            `[API] Room currencies requested - roomId=${req.query.roomId}`
        );

        if (!Number.isSafeInteger(roomId)) {

            return res
                .status(400)
                .json([]);
        }

        return res
            .status(200)
            .json([]);
    }
);

// =========================================================
// ROOM CURRENCY BALANCES
// GET /api/roomcurrencies/v1/getAllBalances?roomId=1
// =========================================================
//
// 20231207 compatibility probe.
// No room currencies currently exist in Hydrium, therefore
// there are no balances to return.
// =========================================================

router.get(
    "/api/roomcurrencies/v1/getAllBalances",
    (req, res) => {

        const roomId =
            Number(req.query.roomId);

        console.log(
            `[API] Room currency balances requested - roomId=${req.query.roomId}`
        );

        if (!Number.isSafeInteger(roomId)) {

            return res
                .status(400)
                .json([]);
        }

        return res
            .status(200)
            .json([]);
    }
);


// =========================================================
// MY ROOM CONSUMABLES
// GET /api/roomconsumables/v1/roomConsumable/room/:roomId/me
// =========================================================
//
// 20231207 compatibility probe.
// The account currently owns no room-specific consumables.
// =========================================================

router.get(
    "/api/roomconsumables/v1/roomConsumable/room/:roomId/me",
    (req, res) => {

        const roomId =
            Number(req.params.roomId);

        console.log(
            `[API] My room consumables requested - roomId=${req.params.roomId}`
        );

        if (!Number.isSafeInteger(roomId)) {

            return res
                .status(400)
                .json([]);
        }

        return res
            .status(200)
            .json([]);
    }
);

// ---------------------------------------------------------
// GET /api/messages/v2/get
// ---------------------------------------------------------

router.get("/api/messages/v2/get", (req, res) => {
    console.log("[API] Messages requested");

    return res.status(200).json([]);
});

// =========================================================
// GET /api/influencerpartnerprogram/influencers
// =========================================================

router.get(
    "/api/influencerpartnerprogram/influencers",
    (req, res) => {
        console.log(
            "[API] Influencer Partner Program requested"
        );

        let influencerIds = [2, 12];

        const take = Number(req.query.take);

        if (
            Number.isSafeInteger(take) &&
            take > 0
        ) {
            influencerIds =
                influencerIds.slice(0, take);
        }

        return res.status(200).json({
            ContinuationToken: null,
            InfluencerIds: influencerIds
        });
    }
);

module.exports = router;