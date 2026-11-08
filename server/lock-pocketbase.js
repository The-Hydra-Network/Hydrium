// Chiude (o riapre) le regole API delle collezioni hydrium_* di PocketBase.
// Chiuse = solo i superuser possono leggere/scrivere dall'API. Hydrium entra come superuser
// (POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD nel .env, vedi apply-pb-admin.js).
// Uso (dalla cartella server):
//   set PB_URL=http://127.0.0.1:8090
//   set PB_ADMIN_EMAIL=tua@email.it
//   set PB_ADMIN_PASSWORD=la-tua-password
//   node lock-pocketbase.js          (chiude)
//   node lock-pocketbase.js --open   (riapre, per tornare indietro)
const PB_URL = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const EMAIL = process.env.PB_ADMIN_EMAIL, PASSWORD = process.env.PB_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Imposta PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD."); process.exit(1); }
const value = process.argv.includes("--open") ? "" : null;

async function api(method, path, token, body) {
    const res = await fetch(PB_URL + path, {
        method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
}
(async () => {
    const { token } = await api("POST", "/api/collections/_superusers/auth-with-password", null, { identity: EMAIL, password: PASSWORD });
    const cols = (await api("GET", "/api/collections?perPage=500", token)).items.filter(c => c.name.startsWith("hydrium_"));
    for (const c of cols) {
        await api("PATCH", `/api/collections/${c.id}`, token, { listRule: value, viewRule: value, createRule: value, updateRule: value, deleteRule: value });
        console.log(`[${value === null ? "chiusa" : "aperta"}] ${c.name}`);
    }
    console.log(`\nFatto: ${cols.length} collezioni ${value === null ? "chiuse (solo superuser)" : "aperte"}.`);
})().catch(e => { console.error(e.message); process.exit(1); });
