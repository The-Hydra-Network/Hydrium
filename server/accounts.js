const express = require("express");
const jwt = require("jsonwebtoken");

const pb = require("./pb");

const router = express.Router();

// ---------------------------------------------------------
// JWT configuration
// ---------------------------------------------------------

const JWT_SECRET =
    process.env.HYDRIUM_JWT_SECRET || "hydrium-development-secret";

if (!process.env.HYDRIUM_JWT_SECRET) {
    console.warn(
        "[ACCOUNTS] HYDRIUM_JWT_SECRET is not configured; using fallback development secret."
    );
}

// ---------------------------------------------------------
// Body parser
// ---------------------------------------------------------
//
// /account/create uses:
// Content-Type: application/x-www-form-urlencoded
//

router.use(
    express.urlencoded({
        extended: false
    })
);

// ---------------------------------------------------------
// PocketBase collection
// ---------------------------------------------------------

const ACCOUNT_COLLECTION = pb.hydriumCollections.accounts;

if (!ACCOUNT_COLLECTION) {
    throw new Error(
        "[ACCOUNTS] PocketBase accounts collection is not configured."
    );
}

// ---------------------------------------------------------
// Authentication helper
// ---------------------------------------------------------

function getAccountFromToken(req) {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
        return null;
    }

    const token = auth.substring(7).trim();

    if (!token) {
        return null;
    }

    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        console.log(
            "[ACCOUNTS] Invalid token:",
            err.message
        );

        return null;
    }
}

// ---------------------------------------------------------
// Generate Revived account ID
// ---------------------------------------------------------
//
// This is NOT the PocketBase record ID.
//
// PocketBase:
//     record.id = "abc123..."
//
// Revived:
//     accountId = 123456789
//

async function generateAccountId() {
    while (true) {
        // Positive 9-digit account ID.
        const accountId = Math.floor(
            100000000 +
            Math.random() * 900000000
        );

        try {
            await pb
                .collection(ACCOUNT_COLLECTION)
                .getFirstListItem(
                    `accountId = ${accountId}`
                );

            // Account already exists.
            // Generate another one.
        } catch (err) {
            // PocketBase returns 404 when no matching
            // record exists.

            if (
                err.status === 404 ||
                err.status === 400
            ) {
                return accountId;
            }

            throw err;
        }
    }
}

// ---------------------------------------------------------
// Generate random username
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
        "Legend",
        "Shadow"
    ];

    const adjective =
        adjectives[
            Math.floor(
                Math.random() * adjectives.length
            )
        ];

    const noun =
        nouns[
            Math.floor(
                Math.random() * nouns.length
            )
        ];

    const number =
        Math.floor(
            1000 +
            Math.random() * 9000
        );

    return `${adjective}${noun}${number}`;
}

// ---------------------------------------------------------
// Find account by Revived accountId
// ---------------------------------------------------------

async function getAccountById(accountId) {
    const numericId = Number(accountId);

    if (!Number.isSafeInteger(numericId)) {
        throw new Error("Invalid accountId");
    }

    return await pb
        .collection(ACCOUNT_COLLECTION)
        .getFirstListItem(
            `accountId = ${numericId}`
        );
}

// ---------------------------------------------------------
// Format account
// ---------------------------------------------------------

function formatAccount(record, decoded = {}) {
    return {
        accountId: Number(record.accountId),

        username:
            record.username || "",

        displayName:
            record.displayName ||
            record.username ||
            "",

        profileImage:
            record.profileImage || "",

        bannerImage:
            record.bannerImage || "",

        displayEmoji:
            record.displayEmoji || "",

        isJunior:
            record.isJunior ??
            decoded.junior ??
            false,

        platforms:
            record.platforms ?? 0,

        personalPronouns:
            record.personalPronouns ?? 0,

        identityFlags:
            record.identityFlags ?? 0,

        // createdAt is intentionally treated as a STRING.
        createdAt:
            record.createdAt ||
            record.created ||
            null
    };
}

// ---------------------------------------------------------
// POST /account/create
// ---------------------------------------------------------
//
// Creates a brand-new account.
//
// Authentication:
//     NONE
//
// Expected request:
//
// Content-Type:
//     application/x-www-form-urlencoded
//
// platform=
// platformId=
//

router.post(
    "/account/create",
    async (req, res) => {
        console.log(
            "[ACCOUNTS] Account creation requested"
        );

        // -------------------------------------------------
        // Parse request
        // -------------------------------------------------

        const platform =
            typeof req.body?.platform === "string"
                ? req.body.platform
                : "";

        const platformId =
            typeof req.body?.platformId === "string"
                ? req.body.platformId
                : "";

        console.log(
            `[ACCOUNTS] Create request - platform=${platform}, platformId=${platformId}`
        );

        try {
            // -------------------------------------------------
            // Generate account information
            // -------------------------------------------------

            const accountId =
                await generateAccountId();

            const username =
                generateUsername();

            const displayName =
                username;

            // IMPORTANT:
            // createdAt is a STRING in PocketBase.
            const now =
                new Date().toISOString();

            // -------------------------------------------------
            // Create PocketBase account
            // -------------------------------------------------
            //
            // platformId is intentionally NOT stored here.
            //

            const record =
                await pb
                    .collection(
                        ACCOUNT_COLLECTION
                    )
                    .create({
                        accountId,

                        username,

                        displayName,

                        profileImage: "",

                        bannerImage: "",

                        displayEmoji: "",

                        isJunior: false,

                        platforms: 0,

                        personalPronouns: 0,

                        identityFlags: 0,

                        createdAt: now
                    });

            console.log(
                `[ACCOUNTS] Account created - accountId=${accountId}, username=${username}, pbId=${record.id}`
            );

            // -------------------------------------------------
            // Return account
            // -------------------------------------------------

            return res
                .status(200)
                .json({
                    success: true,

                    value:
                        formatAccount(record),

                    error: ""
                });

        } catch (err) {
            console.error(
                "[ACCOUNTS] Account creation failed:",
                err
            );

            return res
                .status(500)
                .json({
                    success: false,

                    value: null,

                    error: "Failed to create account"
                });
        }
    }
);

// ---------------------------------------------------------
// GET /account/bulk
// ---------------------------------------------------------

router.get(
    "/account/bulk",
    async (req, res) => {
        console.log(
            `[ACCOUNTS] Bulk account requested - id=${req.query.id}`
        );

        const ids =
            Array.isArray(req.query.id)
                ? req.query.id
                : req.query.id
                    ? [req.query.id]
                    : [];

        try {
            const accounts = [];

            for (const id of ids) {
                try {
                    const record =
                        await getAccountById(id);

                    accounts.push(
                        formatAccount(record)
                    );
                } catch (err) {
                    console.log(
                        `[ACCOUNTS] Could not find account ${id}:`,
                        err.message
                    );
                }
            }

            return res
                .status(200)
                .json(accounts);

        } catch (err) {
            console.error(
                "[ACCOUNTS] Bulk error:",
                err
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
// GET /account/me
// ---------------------------------------------------------

router.get(
    "/account/me",
    async (req, res) => {
        console.log(
            "[ACCOUNTS] Account me requested"
        );

        const decoded =
            getAccountFromToken(req);

        if (!decoded) {
            return res
                .status(401)
                .json({
                    error:
                        "Unauthorized"
                });
        }

        const accountId =
            decoded.sub;

        console.log(
            `[ACCOUNTS] Loading account - accountId=${accountId}`
        );

        try {
            const record =
                await getAccountById(
                    accountId
                );

            console.log(
                `[ACCOUNTS] Account loaded successfully - accountId=${record.accountId}`
            );

            return res
                .status(200)
                .json(
                    formatAccount(
                        record,
                        decoded
                    )
                );

        } catch (err) {
            console.error(
                `[ACCOUNTS] Failed loading account ${accountId}:`,
                err.message
            );

            return res
                .status(404)
                .json({
                    error:
                        "Account not found"
                });
        }
    }
);

// ---------------------------------------------------------
// Export router
// ---------------------------------------------------------

module.exports = router;