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

module.exports = pb;