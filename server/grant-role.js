// Dai o togli ruoli agli account. Non serve installare nulla.
//   node grant-role.js 458293809 admin          (developer + moderator)
//   node grant-role.js 458293809 developer
//   node grant-role.js NomeUtente moderator
//   node grant-role.js 458293809 --remove       (torna giocatore normale)
//   node grant-role.js --list                   (chi ha ruoli)
// Ruoli: admin, developer, moderator, influencer, betastudio (separati da virgola).
// Il giocatore deve chiudere e riaprire il gioco per ricevere il nuovo token.
//
// Servono (come per setup-pocketbase.js):  PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, [PB_URL]
const PB_URL = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const KNOWN = ["admin", "developer", "moderator", "influencer", "betastudio"];
const [, , target, roleArg] = process.argv;

async function api(method, p, body, token) {
    const res = await fetch(PB_URL + p, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
}

async function main() {
    if (!target) {
        console.log("Uso: node grant-role.js <accountId|nome> <ruoli|--remove>   oppure   node grant-role.js --list");
        process.exit(1);
    }
    if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) {
        console.error("Imposta PB_ADMIN_EMAIL e PB_ADMIN_PASSWORD."); process.exit(1);
    }
    const { token } = await api("POST", "/api/collections/_superusers/auth-with-password",
        { identity: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD });

    if (target === "--list") {
        const list = await api("GET", "/api/collections/hydrium_accounts/records?perPage=200&sort=accountId", null, token);
        for (const r of list.items) {
            if (r.role && r.role !== "user") console.log(`${r.accountId}  ${r.username}  (${r.displayName})  ruoli: ${r.role}`);
        }
        return;
    }

    let role;
    if (roleArg === "--remove") role = "user";
    else {
        const parts = String(roleArg || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
        const bad = parts.filter(p => !KNOWN.includes(p));
        if (!parts.length || bad.length) {
            console.error(`Ruolo non valido: ${bad.join(", ") || "(vuoto)"}. Validi: ${KNOWN.join(", ")}`); process.exit(1);
        }
        role = parts.join(",");
    }

    const isId = /^\d+$/.test(target);
    const filter = isId ? `accountId = ${target}` : `username = "${target.replace(/"/g, "")}"`;
    const found = await api("GET", `/api/collections/hydrium_accounts/records?perPage=1&filter=${encodeURIComponent(filter)}`, null, token);
    if (!found.items.length) { console.error("Account non trovato."); process.exit(1); }
    const acc = found.items[0];
    await api("PATCH", `/api/collections/hydrium_accounts/records/${acc.id}`, { role }, token);
    console.log(`OK: ${acc.accountId} (${acc.username}) -> ruolo "${role}". Riapri il gioco per applicarlo.`);
}
main().catch(e => { console.error("[ERRORE]", e.message); process.exit(1); });
