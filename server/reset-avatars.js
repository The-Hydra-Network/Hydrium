// Resetta gli avatar degli utenti di Hydrium (tornano quello predefinito).
// Cancella i record in hydrium_avatar (avatar attuale), hydrium_outfits e
// hydrium_custom_avatar_saves (outfit salvati). NON tocca gli account.
//
// Uso (dalla cartella server, con Hydrium SPENTO):
//   $env:PB_URL="http://127.0.0.1:8090"; $env:PB_ADMIN_EMAIL="..."; $env:PB_ADMIN_PASSWORD="..."
//   node reset-avatars.js                    -> mostra quanti record verrebbero cancellati (non cancella)
//   node reset-avatars.js --yes              -> resetta TUTTI gli utenti
//   node reset-avatars.js --yes --account 5  -> resetta solo l'accountId 5
//   aggiungi --items per cancellare anche gli oggetti avatar posseduti (hydrium_custom_avatar_items)
const PB_URL = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const EMAIL = process.env.PB_ADMIN_EMAIL, PASSWORD = process.env.PB_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Imposta PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD."); process.exit(1); }
const args = process.argv.slice(2);
const yes = args.includes("--yes");
const ai = args.indexOf("--account");
const account = ai >= 0 ? Number(args[ai + 1]) : null;
if (ai >= 0 && !Number.isSafeInteger(account)) { console.error("--account vuole un numero (accountId)."); process.exit(1); }
const collections = ["hydrium_avatar", "hydrium_outfits", "hydrium_custom_avatar_saves"];
if (args.includes("--items")) collections.push("hydrium_custom_avatar_items");

let token = "";
async function api(method, path, body) {
    const res = await fetch(PB_URL + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) { const e = new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`); e.status = res.status; throw e; }
    return text ? JSON.parse(text) : null;
}
let pbAccountId = null; // id interno PocketBase dell'account (serve a hydrium_outfits)
async function ids(col) {
    const out = [];
    let f = "";
    if (account !== null) f = col === "hydrium_outfits" ? `account = "${pbAccountId}"` : `accountId = ${account}`;
    const filter = f ? `&filter=${encodeURIComponent(f)}` : "";
    for (let page = 1; ; page++) {
        const r = await api("GET", `/api/collections/${col}/records?perPage=200&page=${page}&fields=id${filter}`);
        out.push(...r.items.map(i => i.id));
        if (page >= r.totalPages) break;
    }
    return out;
}
(async () => {
    token = (await api("POST", "/api/collections/_superusers/auth-with-password", { identity: EMAIL, password: PASSWORD })).token;
    const existing = new Set((await api("GET", "/api/collections?perPage=500")).items.map(c => c.name));
    if (account !== null) {
        const r = await api("GET", `/api/collections/hydrium_accounts/records?perPage=1&fields=id&filter=${encodeURIComponent(`accountId = ${account}`)}`);
        if (!r.items.length) { console.error(`Nessun account con accountId ${account}.`); process.exit(1); }
        pbAccountId = r.items[0].id;
    }
    let total = 0;
    for (const col of collections) {
        if (!existing.has(col)) { console.log(`[=] ${col}: non esiste, salto`); continue; }
        const list = await ids(col);
        console.log(`${yes ? "[x]" : "[?]"} ${col}: ${list.length} record${account !== null ? ` (accountId ${account})` : ""}`);
        if (yes) for (const id of list) await api("DELETE", `/api/collections/${col}/records/${id}`);
        total += list.length;
    }
    console.log(yes ? `\nFatto: ${total} record cancellati. RIAVVIA Hydrium (tiene un po' di avatar in memoria).` : `\nNon ho cancellato niente. Rilancia con --yes per resettare.`);
})().catch(e => { console.error(e.message); process.exit(1); });
