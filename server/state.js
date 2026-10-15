const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// =========================================================
// PERMANENT AVATAR STORAGE
// =========================================================

const permanentAvatarDirectory =
    path.join(__dirname, "data");

const permanentAvatarPath =
    path.join(
        permanentAvatarDirectory,
        "permanent-avatars.json"
    );

class PersistentOutfitMap extends Map {
    constructor() {
        super();

        fs.mkdirSync(
            permanentAvatarDirectory,
            { recursive: true }
        );

        this.load();
    }

    load() {
        if (!fs.existsSync(permanentAvatarPath)) {
            console.log(
                "[STATE] No permanent avatar file yet"
            );

            return;
        }

        try {
            const raw =
                fs.readFileSync(
                    permanentAvatarPath,
                    "utf8"
                );

            const entries =
                JSON.parse(raw);

            if (!Array.isArray(entries)) {
                throw new Error(
                    "Permanent avatar file is not an array"
                );
            }

            for (const entry of entries) {
                if (
                    !Array.isArray(entry) ||
                    entry.length !== 2
                ) {
                    continue;
                }

                const accountId =
                    Number(entry[0]);

                const outfit =
                    entry[1];

                if (
                    Number.isSafeInteger(accountId) &&
                    accountId > 0 &&
                    outfit &&
                    typeof outfit === "object" &&
                    !Array.isArray(outfit)
                ) {
                    super.set(
                        accountId,
                        outfit
                    );
                }
            }

            console.log(
                `[STATE] Permanent avatars loaded: ${this.size}`
            );
        } catch (err) {
            console.error(
                "[STATE] Failed to load permanent avatars:",
                err.message
            );
        }
    }

    save() {
        try {
            const entries =
                Array.from(this.entries());

            fs.writeFileSync(
                permanentAvatarPath,
                JSON.stringify(
                    entries,
                    null,
                    2
                ),
                "utf8"
            );

            return true;
        } catch (err) {
            console.error(
                "[STATE] Failed to save permanent avatars:",
                err.message
            );

            return false;
        }
    }

    set(accountId, outfit) {
        const numericAccountId =
            Number(accountId);

        if (
            !Number.isSafeInteger(numericAccountId) ||
            numericAccountId <= 0
        ) {
            throw new Error(
                "Invalid accountId for permanent avatar"
            );
        }

        if (
            !outfit ||
            typeof outfit !== "object" ||
            Array.isArray(outfit)
        ) {
            throw new Error(
                "Invalid permanent avatar data"
            );
        }

        super.set(
            numericAccountId,
            outfit
        );

        this.save();

        console.log(
            `[STATE] Permanent avatar saved - accountId=${numericAccountId}`
        );

        return this;
    }

    delete(accountId) {
        const deleted =
            super.delete(
                Number(accountId)
            );

        if (deleted) {
            this.save();
        }

        return deleted;
    }
}

const outfitByAccountId =
    new PersistentOutfitMap();

// =========================================================
// SESSION / PHOTON STATE
// =========================================================

const accountIdByLoginLock = new Map();
const accountIdByPhotonToken = new Map();
const photonTokenByAccountId = new Map();

function normalizeAccountId(accountId) {
    const value = Number(accountId);

    return Number.isSafeInteger(value) && value > 0
        ? value
        : null;
}

function bindLoginLock(loginLock, accountId) {
    const normalizedAccountId =
        normalizeAccountId(accountId);

    if (
        typeof loginLock !== "string" ||
        loginLock.length === 0 ||
        normalizedAccountId === null
    ) {
        return false;
    }

    accountIdByLoginLock.set(
        loginLock,
        normalizedAccountId
    );

    return true;
}

function getAccountIdByLoginLock(loginLock) {
    if (typeof loginLock !== "string") {
        return null;
    }

    return accountIdByLoginLock.get(loginLock) ?? null;
}

function getOrCreatePhotonToken(accountId) {
    const normalizedAccountId =
        normalizeAccountId(accountId);

    if (normalizedAccountId === null) {
        return null;
    }

    const existing =
        photonTokenByAccountId.get(
            normalizedAccountId
        );

    if (existing) {
        return existing;
    }

    const token =
        "HYDRIUM_" +
        normalizedAccountId +
        "_" +
        crypto.randomBytes(24).toString("hex");

    photonTokenByAccountId.set(
        normalizedAccountId,
        token
    );

    accountIdByPhotonToken.set(
        token,
        normalizedAccountId
    );

    return token;
}

function getAccountIdByPhotonToken(token) {
    if (typeof token !== "string") {
        return null;
    }

    return accountIdByPhotonToken.get(token) ?? null;
}

function clearAccountSession(accountId) {
    const normalizedAccountId =
        normalizeAccountId(accountId);

    if (normalizedAccountId === null) {
        return;
    }

    const photonToken =
        photonTokenByAccountId.get(
            normalizedAccountId
        );

    if (photonToken) {
        accountIdByPhotonToken.delete(
            photonToken
        );

        photonTokenByAccountId.delete(
            normalizedAccountId
        );
    }

    for (
        const [loginLock, mappedAccountId]
        of accountIdByLoginLock
    ) {
        if (
            mappedAccountId ===
            normalizedAccountId
        ) {
            accountIdByLoginLock.delete(
                loginLock
            );
        }
    }

    // The avatar is intentionally NOT deleted here.
    // Logout only clears session and Photon state.
}

module.exports = {
    outfitByAccountId,
    bindLoginLock,
    getAccountIdByLoginLock,
    getOrCreatePhotonToken,
    getAccountIdByPhotonToken,
    clearAccountSession
};