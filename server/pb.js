require("dotenv").config();

const PocketBase = require("pocketbase").default;

const POCKETBASE_URL = process.env.POCKETBASE_URL;

if (!POCKETBASE_URL) {
    throw new Error("POCKETBASE_URL is not configured");
}


// ---------------------------------------------------------
// PocketBase connection
// ---------------------------------------------------------

const pb = new PocketBase(POCKETBASE_URL);

// Hydrium controls authentication itself.
pb.autoCancellation(false);

console.log(
    `[PB] PocketBase configured: ${POCKETBASE_URL}`
);


// ---------------------------------------------------------
// Hydrium PocketBase collections
// ---------------------------------------------------------

const hydriumCollections = {

    // Accounts
    accounts: "hydrium_accounts",

    // Player data
    playersettings: "hydrium_playersettings",
    progression: "hydrium_progression",
    reputation: "hydrium_reputation",
    objectives: "hydrium_objectives",

    // Moderation
    reports: "hydrium_reports",

    // Avatar / cosmetics
    customAvatarSaves:
        "hydrium_custom_avatar_saves",

    outfits:
        "hydrium_outfits"

};


// ---------------------------------------------------------
// Export
// ---------------------------------------------------------

pb.hydriumCollections =
    hydriumCollections;

// ---------------------------------------------------------
// hydrium-PB-ADMIN: Hydrium entra come superuser, cosi' le regole delle
// collezioni possono restare chiuse (lock-pocketbase.js).
// Il login dei giocatori usa un client separato, per non sovrascrivere
// il token del superuser.
// ---------------------------------------------------------
{
    const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
    const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
        const base = POCKETBASE_URL.replace(/\/+$/, "");
        let loginPromise = null;

        const login = () => {
            if (!loginPromise) {
                loginPromise = (async () => {
                    try {
                        const r = await fetch(base + "/api/collections/_superusers/auth-with-password", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
                        });
                        const j = await r.json().catch(() => null);
                        if (!r.ok || !j || !j.token) {
                            throw new Error("login superuser PocketBase fallito (" + r.status + "): controlla POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD");
                        }
                        pb.authStore.save(j.token, j.record);
                        console.log("[PB] Login superuser riuscito");
                    } finally {
                        loginPromise = null;
                    }
                })();
            }
            return loginPromise;
        };

        const expiringSoon = () => {
            try {
                const payload = JSON.parse(Buffer.from(pb.authStore.token.split(".")[1], "base64url").toString());
                return payload.exp * 1000 < Date.now() + 60000;
            } catch (_) {
                return true;
            }
        };

        pb.beforeSend = async (url, options) => {
            if (!pb.authStore.token || expiringSoon()) {
                await login();
            }
            options.headers = Object.assign({}, options.headers, { Authorization: pb.authStore.token });
            return { url, options };
        };

        // authWithPassword degli account dei giocatori: client separato.
        const pbUser = new PocketBase(POCKETBASE_URL);
        pbUser.autoCancellation(false);
        const originalCollection = pb.collection.bind(pb);
        pb.collection = (name) => {
            const service = originalCollection(name);
            if (!service.__HydriumUserAuth) {
                service.authWithPassword = async (...args) => {
                    try {
                        return await pbUser.collection(name).authWithPassword(...args);
                    } finally {
                        pbUser.authStore.clear();
                    }
                };
                service.__HydriumUserAuth = true;
            }
            return service;
        };

        console.log("[PB] Modalita' superuser attiva (" + ADMIN_EMAIL + ")");
        login().catch((e) => console.error("[PB] " + e.message));
    } else {
        console.log("[PB] Nessun POCKETBASE_ADMIN_EMAIL/PASSWORD: accesso anonimo (le regole devono essere aperte)");
    }
}

module.exports = pb;