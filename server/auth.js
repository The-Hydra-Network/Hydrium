const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");

const pb = require("./pb");

const router = express.Router();


// ---------------------------------------------------------
// Body parsing
// ---------------------------------------------------------

router.use(
    express.urlencoded({
        extended: true
    })
);

router.use(
    express.json()
);


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
// PocketBase collections
// ---------------------------------------------------------

const ACCOUNT_COLLECTION =
    pb.hydriumCollections.accounts;

const REFRESH_TOKEN_COLLECTION =
    "hydrium_refresh_tokens";


// ---------------------------------------------------------
// Static files
// ---------------------------------------------------------

const EAC_CHALLENGE_PATH =
    path.join(
        __dirname,
        "blobs",
        "eac-challenge.json"
    );


// ---------------------------------------------------------
// Token configuration
// ---------------------------------------------------------

const TOKEN_TTL_SECONDS = 3600;

const TOKEN_SCOPE =
    "offline_access";

const TOKEN_KEY =
    process.env.HYDRIUM_TOKEN_KEY ||
    "8oQ+e+WQaOBPbEcakhqs3dwZZdOmmyDUmJSD9u4AHMY=";


// ---------------------------------------------------------
// Generate Rec Room account ID
// ---------------------------------------------------------

async function generateAccountId() {

    while (true) {

        const accountId =
            crypto.randomInt(
                100000000,
                999999999
            );

        try {

            await pb
                .collection(
                    ACCOUNT_COLLECTION
                )
                .getFirstListItem(
                    `accountId = ${accountId}`
                );

        } catch (err) {

            if (err.status === 404) {
                return accountId;
            }

            throw err;
        }
    }
}


// ---------------------------------------------------------
// Generate username
// ---------------------------------------------------------

function generateUsername() {

    const adjectives = [
        "Shadow",
        "Silent",
        "Azure",
        "Crimson",
        "Cosmic",
        "Golden",
        "Rapid",
        "Mystic",
        "Neon",
        "Lunar",
        "Frost",
        "Phantom",
        "Solar",
        "Cyber",
        "Rogue"
    ];

    const nouns = [
        "Player",
        "Fox",
        "Wolf",
        "Knight",
        "Dragon",
        "Rider",
        "Ghost",
        "Wizard",
        "Hunter",
        "Ninja",
        "Hero",
        "Traveler",
        "Pilot",
        "Legend"
    ];

    const adjective =
        adjectives[
            crypto.randomInt(
                0,
                adjectives.length
            )
        ];

    const noun =
        nouns[
            crypto.randomInt(
                0,
                nouns.length
            )
        ];

    const number =
        crypto.randomInt(
            1000,
            10000
        );

    return (
        `${adjective}${noun}${number}`
    );
}


// ---------------------------------------------------------
// Find account by numeric Rec Room accountId
// ---------------------------------------------------------

async function getAccountById(accountId) {

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
            ACCOUNT_COLLECTION
        )
        .getFirstListItem(
            `accountId = ${numericId}`
        );
}


// ---------------------------------------------------------
// Create access token
// ---------------------------------------------------------

function createAccessToken(
    account,
    ver
) {

    const gameVersion =
        ver ||
        process.env.GAME_VERSION ||
        "20231207";

    const claims = {

        sub:
            String(
                account.accountId
            ),

        role:
            account.role ||
            "user",

        junior:
            Boolean(
                account.isJunior
            ),

        screenshare:
            true,

        "rn.ver":
            gameVersion
    };

    if (account.isJunior) {

        claims["rn.privilege"] =
            "BanVChat,BanRmChat";
    }

    return jwt.sign(
        claims,
        JWT_SECRET,
        {
            expiresIn:
                TOKEN_TTL_SECONDS
        }
    );
}


// ---------------------------------------------------------
// Generate refresh token
// ---------------------------------------------------------

function generateRefreshToken() {

    return crypto
        .randomBytes(48)
        .toString("hex");
}


// ---------------------------------------------------------
// Store refresh token
// ---------------------------------------------------------

async function storeRefreshToken(
    account,
    tokens
) {

    const data = {

        account:
            account.id,

        access_token:
            tokens.access_token,

        expires_in:
            tokens.expires_in,

        key:
            tokens.key,

        refresh_token:
            tokens.refresh_token,

        scope:
            tokens.scope,

        token_type:
            tokens.token_type
    };

    const record =
        await pb
            .collection(
                REFRESH_TOKEN_COLLECTION
            )
            .create(
                data
            );

    console.log(
        `[AUTH] Refresh token stored - tokenRecord=${record.id}, accountId=${account.accountId}`
    );

    return record;
}


// ---------------------------------------------------------
// Issue access + refresh tokens
// ---------------------------------------------------------

async function issueTokens(
    account,
    ver,
    platform,
    platformId,
    deviceId,
    deviceClass
) {

    const accessToken =
        createAccessToken(
            account,
            ver
        );

    const refreshToken =
        generateRefreshToken();

    const tokens = {

        access_token:
            accessToken,

        expires_in:
            TOKEN_TTL_SECONDS,

        token_type:
            "Bearer",

        refresh_token:
            refreshToken,

        scope:
            TOKEN_SCOPE,

        key:
            TOKEN_KEY
    };

    await storeRefreshToken(
        account,
        tokens
    );

    return tokens;
}


// =========================================================
// EAC challenge
// =========================================================

router.get(
    "/eac/challenge",
    (req, res) => {

        console.log(
            "[AUTH] EAC challenge requested"
        );

        return res.sendFile(
            EAC_CHALLENGE_PATH
        );
    }
);


// =========================================================
// Platform -> account cached login database
// =========================================================

const PLATFORM_LINKS_PATH =
    path.join(
        __dirname,
        "blobs",
        "platform-links.json"
    );


function loadPlatformLinks() {

    try {

        if (
            !fs.existsSync(
                PLATFORM_LINKS_PATH
            )
        ) {

            return [];
        }

        const raw =
            fs.readFileSync(
                PLATFORM_LINKS_PATH,
                "utf8"
            );

        if (!raw.trim()) {

            return [];
        }

        const parsed =
            JSON.parse(
                raw
            );

        return Array.isArray(parsed)
            ? parsed
            : [];

    } catch (err) {

        console.error(
            "[AUTH] Failed to load platform links:",
            err.message
        );

        return [];
    }
}


function savePlatformLinks(links) {

    fs.mkdirSync(
        path.dirname(
            PLATFORM_LINKS_PATH
        ),
        {
            recursive:
                true
        }
    );

    fs.writeFileSync(
        PLATFORM_LINKS_PATH,
        JSON.stringify(
            links,
            null,
            4
        ),
        "utf8"
    );
}


function findPlatformLink(
    platform,
    platformId
) {

    const links =
        loadPlatformLinks();

    return links.find(
        (link) =>
            String(
                link.platform
            ) ===
                String(
                    platform
                ) &&

            String(
                link.platformId
            ) ===
                String(
                    platformId
                )
    );
}


function savePlatformLink(
    platform,
    platformId,
    accountId
) {

    if (
        platform === undefined ||
        platform === null ||
        platformId === undefined ||
        platformId === null ||
        String(
            platformId
        ).trim() === ""
    ) {

        return;
    }

    const links =
        loadPlatformLinks();

    const existing =
        links.find(
            (link) =>
                String(
                    link.platform
                ) ===
                    String(
                        platform
                    ) &&

                String(
                    link.platformId
                ) ===
                    String(
                        platformId
                    )
        );

    const now =
        new Date()
            .toISOString();

    if (existing) {

        existing.accountId =
            Number(
                accountId
            );

        existing.lastLoginTime =
            now;

        existing.requirePassword =
            false;

    } else {

        links.push({

            platform:
                Number(
                    platform
                ),

            platformId:
                String(
                    platformId
                ),

            accountId:
                Number(
                    accountId
                ),

            lastLoginTime:
                now,

            requirePassword:
                false
        });
    }

    savePlatformLinks(
        links
    );

    console.log(
        `[AUTH] Platform linked - platform=${platform}, platformId=${platformId}, accountId=${accountId}`
    );
}


function cachedLoginResponse(
    link
) {

    return {

        platform:
            Number(
                link.platform
            ),

        platformId:
            String(
                link.platformId
            ),

        accountId:
            Number(
                link.accountId
            ),

        lastLoginTime:
            new Date()
                .toISOString(),

        requirePassword:
            false
    };
}


// =========================================================
// Cached login - single platform ID
// =========================================================

router.get(
    "/cachedlogin/forplatformid/:platform/:id",
    (req, res) => {

        const platform =
            req.params.platform;

        const platformId =
            req.params.id;

        console.log(
            `[AUTH] GET cached login - platform=${platform}, id=${platformId}`
        );

        const link =
            findPlatformLink(
                platform,
                platformId
            );

        if (!link) {

            console.log(
                `[AUTH] No cached login mapping - platform=${platform}, platformId=${platformId}`
            );

            return res.json(
                []
            );
        }

        console.log(
            `[AUTH] Cached login resolved - accountId=${link.accountId}`
        );

        return res.json([
            cachedLoginResponse(
                link
            )
        ]);
    }
);


router.post(
    "/cachedlogin/forplatformid/:platform/:id",
    (req, res) => {

        const platform =
            req.params.platform;

        const platformId =
            req.params.id;

        console.log(
            `[AUTH] POST cached login - platform=${platform}, id=${platformId}`
        );

        const link =
            findPlatformLink(
                platform,
                platformId
            );

        if (!link) {

            console.log(
                `[AUTH] No cached login mapping - platform=${platform}, platformId=${platformId}`
            );

            return res.json(
                []
            );
        }

        console.log(
            `[AUTH] Cached login resolved - accountId=${link.accountId}`
        );

        return res.json([
            cachedLoginResponse(
                link
            )
        ]);
    }
);


// =========================================================
// Cached login - multiple platform IDs
// =========================================================

router.post(
    "/cachedlogin/forplatformids",
    (req, res) => {

        console.log(
            "[AUTH] POST cached login for platform IDs"
        );

        const requested =
            Array.isArray(
                req.body
            )
                ? req.body
                : [];

        const results =
            [];

        for (
            const item
            of requested
        ) {

            if (!item) {

                continue;
            }

            const link =
                findPlatformLink(
                    item.platform,
                    item.platformId
                );

            if (link) {

                results.push(
                    cachedLoginResponse(
                        link
                    )
                );
            }
        }

        return res.json(
            results
        );
    }
);


// =========================================================
// POST /connect/token
// =========================================================

router.post(
    "/connect/token",
    async (req, res) => {

        const {
            grant_type,
            account_id,
            username,
            password,
            platform,
            platform_id,
            platform_auth,
            refresh_token,
            device_id,
            device_class,
            ver
        } = req.body;


        console.log(
            "\n[AUTH] POST /connect/token"
        );

        console.log(
            "[AUTH] grant_type:",
            grant_type
        );

        console.log(
            "[AUTH] account_id:",
            account_id
        );

        console.log(
            "[AUTH] username:",
            username
        );

        console.log(
            "[AUTH] platform:",
            platform
        );

        console.log(
            "[AUTH] platform_id:",
            platform_id
        );

        console.log(
            "[AUTH] device_id:",
            device_id
        );

        console.log(
            "[AUTH] device_class:",
            device_class
        );

        console.log(
            "[AUTH] ver:",
            ver
        );


        // =================================================
        // CREATE ACCOUNT
        // =================================================

        if (
            grant_type ===
            "create_account"
        ) {

            try {

                console.log(
                    `[AUTH] Creating account - platform=${platform || ""}, platformId=${platform_id || ""}`
                );


                // -----------------------------------------
                // Generate account ID
                // -----------------------------------------

                const newAccountId =
                    await generateAccountId();


                // -----------------------------------------
                // Generate username
                // -----------------------------------------

                const generatedUsername =
                    generateUsername();


                // -----------------------------------------
                // Generate password
                // -----------------------------------------

                const generatedPassword =
                    password ||
                    crypto
                        .randomBytes(
                            32
                        )
                        .toString(
                            "hex"
                        );


                // -----------------------------------------
                // createdAt
                // -----------------------------------------

                const createdAt =
                    new Date()
                        .toISOString();


                // -----------------------------------------
                // Create PocketBase account
                // -----------------------------------------

                const account =
                    await pb
                        .collection(
                            ACCOUNT_COLLECTION
                        )
                        .create({

                            accountId:
                                newAccountId,

                            username:
                                generatedUsername,

                            displayName:
                                generatedUsername,

                            password:
                                generatedPassword,

                            passwordConfirm:
                                generatedPassword,

                            email:
                                `${generatedUsername}@hydrium.local`,

                            emailVisibility:
                                false,

                            isJunior:
                                false,

                            role:
                                "user",

                            platforms:
                                Number(
                                    platform
                                ) || 0,

                            profileImage:
                                "DefaultProfileImage.jpg",

                            bannerImage:
                                "",

                            displayEmoji:
                                "",

                            personalPronouns:
                                0,

                            identityFlags:
                                0,

                            createdAt:
                                createdAt
                        });


                console.log(
                    `[AUTH] Account created - pbId=${account.id}, accountId=${account.accountId}`
                );


                // -----------------------------------------
                // Save Steam/platform -> account mapping
                // -----------------------------------------

                savePlatformLink(
                    platform,
                    platform_id,
                    account.accountId
                );


                // -----------------------------------------
                // Issue token pair
                // -----------------------------------------

                const tokens =
                    await issueTokens(

                        account,

                        ver,

                        platform,

                        platform_id,

                        device_id,

                        device_class
                    );


                console.log(
                    `[AUTH] Token pair issued - accountId=${account.accountId}`
                );


                return res
                    .status(
                        200
                    )
                    .json(
                        tokens
                    );

            } catch (err) {

                console.error(
                    "[AUTH] Failed to create account:",
                    err.response ||
                    err.message
                );

                return res
                    .status(
                        400
                    )
                    .json({
                        error:
                            "invalid_request"
                    });
            }
        }


        // =================================================
        // PASSWORD LOGIN
        // =================================================

        if (
            grant_type ===
                "password" ||
            !grant_type
        ) {

            if (
                !username &&
                !account_id
            ) {

                return res
                    .status(
                        400
                    )
                    .json({
                        error:
                            "invalid_grant"
                    });
            }


            if (!password) {

                return res
                    .status(
                        400
                    )
                    .json({
                        error:
                            "invalid_grant"
                    });
            }


            try {

                let account;


                // -----------------------------------------
                // Username login
                // -----------------------------------------

                if (username) {

                    const authData =
                        await pb
                            .collection(
                                ACCOUNT_COLLECTION
                            )
                            .authWithPassword(
                                username.trim(),
                                password
                            );

                    account =
                        authData.record;
                }


                // -----------------------------------------
                // Account ID login
                // -----------------------------------------

                else {

                    account =
                        await getAccountById(
                            account_id
                        );

                    await pb
                        .collection(
                            ACCOUNT_COLLECTION
                        )
                        .authWithPassword(
                            account.username,
                            password
                        );
                }


                console.log(
                    `[AUTH] Password login successful - pbId=${account.id}, accountId=${account.accountId}`
                );


                // If platform info came with this login,
                // refresh its association as well.

                if (
                    platform !== undefined &&
                    platform_id
                ) {

                    savePlatformLink(
                        platform,
                        platform_id,
                        account.accountId
                    );
                }


                const tokens =
                    await issueTokens(

                        account,

                        ver,

                        platform,

                        platform_id,

                        device_id,

                        device_class
                    );


                return res
                    .status(
                        200
                    )
                    .json(
                        tokens
                    );

            } catch (err) {

                console.log(
                    "[AUTH] Password login failed:",
                    err.response ||
                    err.message
                );

                return res
                    .status(
                        401
                    )
                    .json({
                        error:
                            "invalid_grant"
                    });
            }
        }


        // =================================================
        // CACHED LOGIN
        // =================================================

        if (
            grant_type ===
            "cached_login"
        ) {

            console.log(
                `[AUTH] Cached login - account_id=${account_id}, platform=${platform}, platform_id=${platform_id}`
            );


            if (!account_id) {

                return res
                    .status(
                        400
                    )
                    .json({
                        error:
                            "invalid_grant"
                    });
            }


            try {

                const account =
                    await getAccountById(
                        account_id
                    );


                console.log(
                    `[AUTH] Cached login account found - pbId=${account.id}, accountId=${account.accountId}`
                );


                if (
                    platform !== undefined &&
                    platform_id
                ) {

                    savePlatformLink(
                        platform,
                        platform_id,
                        account.accountId
                    );
                }


                const tokens =
                    await issueTokens(

                        account,

                        ver,

                        platform,

                        platform_id,

                        device_id,

                        device_class
                    );


                return res
                    .status(
                        200
                    )
                    .json(
                        tokens
                    );

            } catch (err) {

                console.log(
                    "[AUTH] Cached login failed:",
                    err.response ||
                    err.message
                );

                return res
                    .status(
                        401
                    )
                    .json({
                        error:
                            "invalid_grant"
                    });
            }
        }


        // =================================================
        // REFRESH TOKEN
        // =================================================

        if (
            grant_type ===
            "refresh_token"
        ) {

            if (!refresh_token) {

                return res
                    .status(
                        400
                    )
                    .json({
                        error:
                            "invalid_grant"
                    });
            }


            try {

                console.log(
                    "[AUTH] Redeeming refresh token"
                );


                // -----------------------------------------
                // Find refresh token
                // -----------------------------------------

                const tokenRecord =
                    await pb
                        .collection(
                            REFRESH_TOKEN_COLLECTION
                        )
                        .getFirstListItem(
                            `refresh_token = "${refresh_token}"`
                        );


                console.log(
                    `[AUTH] Refresh token found - tokenRecord=${tokenRecord.id}`
                );


                if (
                    !tokenRecord.account
                ) {

                    throw new Error(
                        "Refresh token has no account relation"
                    );
                }


                // -----------------------------------------
                // Resolve account
                // -----------------------------------------

                const account =
                    await pb
                        .collection(
                            ACCOUNT_COLLECTION
                        )
                        .getOne(
                            String(
                                tokenRecord.account
                            )
                        );


                console.log(
                    `[AUTH] Refresh account resolved - pbId=${account.id}, accountId=${account.accountId}`
                );


                // -----------------------------------------
                // Delete old refresh token
                // -----------------------------------------

                await pb
                    .collection(
                        REFRESH_TOKEN_COLLECTION
                    )
                    .delete(
                        tokenRecord.id
                    );


                // -----------------------------------------
                // Issue replacement tokens
                // -----------------------------------------

                const tokens =
                    await issueTokens(

                        account,

                        ver,

                        undefined,

                        undefined,

                        undefined,

                        undefined
                    );


                console.log(
                    `[AUTH] Refresh successful - accountId=${account.accountId}`
                );


                return res
                    .status(
                        200
                    )
                    .json(
                        tokens
                    );

            } catch (err) {

                console.log(
                    "[AUTH] Refresh token failed:",
                    err.response ||
                    err.message
                );

                return res
                    .status(
                        401
                    )
                    .json({
                        error:
                            "invalid_grant"
                    });
            }
        }


        // =================================================
        // UNKNOWN GRANT
        // =================================================

        console.log(
            "[AUTH] Unsupported grant_type:",
            grant_type
        );

        return res
            .status(
                400
            )
            .json({
                error:
                    "unsupported_grant_type"
            });
    }
);


// =========================================================
// POST /account/recoverpassword
// =========================================================

router.post(
    "/account/recoverpassword",
    async (req, res) => {

        console.log(
            "[AUTH] Password recovery/change requested"
        );


        const auth =
            req.headers.authorization;


        if (
            !auth ||
            !auth.startsWith(
                "Bearer "
            )
        ) {

            return res
                .status(
                    401
                )
                .json({
                    success:
                        false,

                    error:
                        "Unauthorized"
                });
        }


        const token =
            auth.substring(
                7
            );


        try {

            const decoded =
                jwt.verify(
                    token,
                    JWT_SECRET
                );


            if (!decoded.sub) {

                return res
                    .status(
                        401
                    )
                    .json({
                        success:
                            false,

                        error:
                            "Unauthorized"
                    });
            }


            const account =
                await getAccountById(
                    decoded.sub
                );


            const {
                newPassword,
                oldPassword = ""
            } = req.body;


            if (!newPassword) {

                return res
                    .status(
                        400
                    )
                    .json({
                        success:
                            false,

                        error:
                            "newPassword is required"
                    });
            }


            // ---------------------------------------------
            // Verify old password
            // ---------------------------------------------

            if (oldPassword) {

                try {

                    await pb
                        .collection(
                            ACCOUNT_COLLECTION
                        )
                        .authWithPassword(
                            account.username,
                            oldPassword
                        );

                } catch (err) {

                    console.log(
                        `[AUTH] Incorrect old password - accountId=${account.accountId}`
                    );

                    return res
                        .status(
                            400
                        )
                        .json({
                            success:
                                false,

                            error:
                                "Invalid old password"
                        });
                }
            }


            // ---------------------------------------------
            // Change password
            // ---------------------------------------------

            await pb
                .collection(
                    ACCOUNT_COLLECTION
                )
                .update(
                    account.id,
                    {

                        password:
                            newPassword,

                        passwordConfirm:
                            newPassword
                    }
                );


            console.log(
                `[AUTH] Password changed - accountId=${account.accountId}`
            );


            return res
                .status(
                    200
                )
                .json({

                    success:
                        true,

                    error:
                        ""
                });

        } catch (err) {

            console.log(
                "[AUTH] Password change failed:",
                err.response ||
                err.message
            );

            return res
                .status(
                    401
                )
                .json({

                    success:
                        false,

                    error:
                        "Unauthorized"
                });
        }
    }
);


// ---------------------------------------------------------
// Export
// ---------------------------------------------------------

module.exports = router;