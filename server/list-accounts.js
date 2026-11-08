// Lists the accounts in Hydrium so you know which usernames exist.
//   cd <the server folder>      (the one with .env, pb.js and node_modules)
//   node list-accounts.js
require("dotenv").config();
const fs = require("fs"), path = require("path");
const pb = require("./pb");
(async () => {
    let marks = {};
    try { const v = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "password-set.json"), "utf8")); marks = Array.isArray(v) ? Object.fromEntries(v.map((i) => [String(i), 1])) : v; } catch (_) {}
    let rows;
    try { rows = await pb.collection(pb.hydriumCollections.accounts).getFullList({ sort: "created" }); }
    catch (e) { console.log("Could not read accounts:", e.status || "", e.message); process.exit(1); }
    console.log(`${rows.length} account(s). Log in with the USERNAME (not the display name) and the password.\n`);
    console.log("accountId".padEnd(11) + "username".padEnd(28) + "display name".padEnd(24) + "password set by a person?");
    for (const r of rows) console.log(String(r.accountId).padEnd(11) + String(r.username).padEnd(28) + String(r.displayName || "").padEnd(24) + (marks[String(r.accountId)] ? "yes" : "no (random one - use set-password.js or the in-game Create password screen)"));
})();