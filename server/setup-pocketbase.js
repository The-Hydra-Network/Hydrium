// Crea tutte le collezioni PocketBase che Hydrium si aspetta.
// Uso (dalla cartella server):
//   set PB_URL=http://127.0.0.1:8090
//   set PB_ADMIN_EMAIL=tua@email.it
//   set PB_ADMIN_PASSWORD=la-tua-password
//   node setup-pocketbase.js
// Si puo' rilanciare: le collezioni gia' esistenti vengono saltate.
// Non servono pacchetti npm (usa fetch di Node 18+).

const PB_URL = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const EMAIL = process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) {
    console.error("Imposta PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD (l'account superuser di PocketBase).");
    process.exit(1);
}

let token = "";
async function api(method, path, body) {
    const res = await fetch(PB_URL + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    if (!res.ok) {
        const err = new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 600)}`);
        err.status = res.status;
        throw err;
    }
    return json;
}

// helper campi
const num = (name, extra = {}) => ({ name, type: "number", ...extra });
const txt = (name, extra = {}) => ({ name, type: "text", ...extra });
const bool = (name) => ({ name, type: "bool" });
const json = (name) => ({ name, type: "json", maxSize: 5000000 });
const created = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
];

// Il server usa PocketBase senza autenticarsi come admin ("Hydrium controls
// authentication itself"), quindi le regole API devono essere aperte.
// PER QUESTO PocketBase deve ascoltare SOLO su 127.0.0.1 e NON va esposto
// nel tunnel Cloudflare.
const openRules = { listRule: "", viewRule: "", createRule: "", updateRule: "", deleteRule: "" };

async function main() {
    const auth = await api("POST", "/api/collections/_superusers/auth-with-password", { identity: EMAIL, password: PASSWORD });
    token = auth.token;
    console.log("[OK] login superuser");

    const existing = new Map((await api("GET", "/api/collections?perPage=500")).items.map(c => [c.name, c]));

    async function make(def) {
        if (existing.has(def.name)) { console.log(`[=] ${def.name} esiste gia'`); return existing.get(def.name); }
        const rec = await api("POST", "/api/collections", { ...openRules, ...def });
        existing.set(def.name, rec);
        console.log(`[+] ${def.name}`);
        return rec;
    }

    // ---- accounts (auth collection) ----
    const accounts = await make({
        name: "hydrium_accounts",
        type: "auth",
        passwordAuth: { enabled: true, identityFields: ["username"] },
        authRule: "",
        manageRule: null,
        fields: [
            num("accountId", { onlyInt: true, required: true }),
            txt("username", { required: true }),
            txt("displayName"),
            bool("isJunior"),
            txt("role"),
            num("platforms", { onlyInt: true }),
            txt("profileImage"),
            txt("bannerImage"),
            txt("displayEmoji"),
            num("personalPronouns", { onlyInt: true }),
            num("identityFlags", { onlyInt: true }),
            txt("createdAt"),
            ...created
        ],
        indexes: [
            "CREATE UNIQUE INDEX idx_hydrium_accounts_accountId ON hydrium_accounts (accountId)",
            "CREATE UNIQUE INDEX idx_hydrium_accounts_username ON hydrium_accounts (username)"
        ]
    });
    const rel = (name = "account") => ({ name, type: "relation", collectionId: accounts.id, maxSelect: 1, cascadeDelete: true });

    await make({
        name: "hydrium_refresh_tokens",
        type: "base",
        fields: [rel(), txt("access_token", { max: 5000 }), num("expires_in"), txt("key"), txt("refresh_token", { max: 500 }), txt("scope", { max: 1000 }), txt("token_type"), ...created],
        indexes: ["CREATE INDEX idx_hydrium_refresh_tokens_rt ON hydrium_refresh_tokens (refresh_token)"]
    });

    await make({ name: "hydrium_playersettings", type: "base", fields: [rel(), json("data"), ...created] });
    await make({ name: "hydrium_progression", type: "base", fields: [rel(), num("Level"), num("XP"), ...created] });
    await make({
        name: "hydrium_reputation", type: "base",
        fields: [rel(), bool("IsCheerful"), num("Noteriety"), num("SelectedCheer"), num("CheerCredit"), num("CheerGeneral"), num("CheerHelpful"),
            num("CheerCreative"), num("CheerGreatHost"), num("CheerSportsman"), num("SubscriberCount"), num("SubscribedCount"), ...created]
    });
    await make({ name: "hydrium_objectives", type: "base", fields: [rel(), json("progress"), ...created] });
    await make({
        name: "hydrium_reports", type: "base",
        fields: [rel(), num("Duration"), num("GameSessionId"), bool("banned"), bool("IsHostKick"), bool("IsVoiceModAutoban"), txt("Message", { max: 2000 }),
            num("PlayerIdReporter"), num("ReportCategory"), txt("TimeoutStartedAt"), ...created]
    });
    await make({
        name: "hydrium_custom_avatar_saves", type: "base",
        fields: [rel(), num("accountId"), num("slot"), json("data"), txt("avatarItemDesc"), txt("customAvatarItemId"), txt("customAvatarItemSaveId"),
            txt("unityAssetId"), txt("unityAssetHash"), txt("thumbnailFileName"), json("additionalConfiguration"), ...created]
    });
    await make({
        name: "hydrium_outfits", type: "base",
        fields: [rel(), num("slot"), json("FaceFeatures"), json("HairColor"), json("SkinColor"), json("SelectionsV1"), json("SelectionsV2"), ...created]
    });
    await make({ name: "hydrium_avatar", type: "base", fields: [num("accountId"), json("data"), ...created] });
    await make({ name: "hydrium_custom_avatar_items", type: "base", fields: [num("accountId"), json("data"), ...created] });
    await make({ name: "hydrium_default_avatar_items", type: "base", fields: [json("data"), ...created] });
    await make({ name: "hydrium_storefronts", type: "base", fields: [json("data"), ...created] });

    console.log("\nFatto. Collezioni create/verificate:", [...existing.keys()].filter(n => n.startsWith("hydrium_")).length);
}

main().catch(e => { console.error("[ERRORE]", e.message); process.exit(1); });
