// Creates an account with a username and password you choose, so username + password login works for it.
//   cd <the server folder>
//   node make-account.js <username> <password>          e.g.  node make-account.js coach MyPassw0rd
// Same fields the game's own "create account" fills in. Usernames: letters, numbers and _ (3-20 characters).
// Passwords: at least 8 characters. A password on the command line stays in the shell history.
require("dotenv").config();
const crypto = require("crypto"), fs = require("fs"), path = require("path");
const pb = require("./pb");
const [, , username, password] = process.argv;
if (!username || !password) { console.log("usage: node make-account.js <username> <password (8+ characters)>"); process.exit(2); }
if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) { console.log("The username can only use letters, numbers and _ (3-20 characters)."); process.exit(2); }
if (password.length < 8) { console.log("The password must be at least 8 characters."); process.exit(2); }
(async () => {
    const col = pb.collection(pb.hydriumCollections.accounts);
    try { await col.getFirstListItem(pb.filter("username = {:u}", { u: username })); console.log(`The username '${username}' is already taken.`); process.exit(1); } catch (e) { if (e.status && e.status !== 404) { console.log("PocketBase error:", e.status, e.message); process.exit(1); } }
    let accountId;
    for (;;) {
        accountId = crypto.randomInt(100000000, 999999999);
        try { await col.getFirstListItem(pb.filter("accountId = {:n}", { n: accountId })); } catch (e) { if (e.status === 404) break; throw e; }
    }
    try {
        const rec = await col.create({ accountId, username, displayName: username, password, passwordConfirm: password, email: `${username.toLowerCase()}@hydrium.local`, emailVisibility: false,
            isJunior: false, role: "user", platforms: 0, profileImage: "DefaultProfileImage.jpg", bannerImage: "", displayEmoji: "", personalPronouns: 0, identityFlags: 0, createdAt: new Date().toISOString() });
        try { const f = path.join(process.cwd(), "data", "password-set.json"); let m = {}; try { const v = JSON.parse(fs.readFileSync(f, "utf8")); m = Array.isArray(v) ? Object.fromEntries(v.map((i) => [String(i), 1])) : v; } catch (_) {} m[String(accountId)] = new Date().toISOString(); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(m, null, 2)); } catch (_) {}
        console.log(`Created account ${rec.accountId}: username '${username}'. Log in with that username and your password.`);
    } catch (e) { console.log("PocketBase refused:", e.status || "", (e.response && e.response.message) || e.message, JSON.stringify((e.response && e.response.data) || {})); process.exit(1); }
})();