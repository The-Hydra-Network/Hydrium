// Why can't I switch accounts?  Shows the account picker the game gets, and fixes it.
//   cd <the server folder>
//   node accounts-doctor.js                      show the state + what to do
//   node accounts-doctor.js link <username|id>   put that account in the picker of this client
//   node accounts-doctor.js unlink <username|id> take it out again
// The game's account picker lists the accounts LINKED to this computer's platform id (Steam id). An account is linked the
// moment it logs in on this client (any login type). An account that never logged in here - e.g. one made with
// make-account.js - is not in the picker until it is linked once. Stop the server before link/unlink, then start it again.
require("dotenv").config();
const fs = require("fs"), path = require("path");
const pb = require("./pb");
const LINKS = path.join(process.cwd(), "blobs", "platform-links.json");
const [, , cmd, who] = process.argv;
const load = () => { try { const v = JSON.parse(fs.readFileSync(LINKS, "utf8")); return Array.isArray(v) ? v : []; } catch { return []; } };
const find = async (w) => {
    const col = pb.collection(pb.hydriumCollections.accounts);
    return /^\d{6,}$/.test(w) ? col.getFirstListItem(pb.filter("accountId = {:n}", { n: Number(w) })) : col.getFirstListItem(pb.filter("username = {:u}", { u: w }));
};
(async () => {
    let authSrc = ""; try { authSrc = fs.readFileSync(path.join(process.cwd(), "auth.js"), "utf8"); } catch {}
    const multi = authSrc.includes("allPlatformLinks");
    const links = load();
    if (cmd === "link" || cmd === "unlink") {
        if (!who) { console.log("usage: node accounts-doctor.js " + cmd + " <username|accountId>"); process.exit(2); }
        let rec; try { rec = await find(who); } catch { console.log(`No account '${who}'. Run: node list-accounts.js`); process.exit(1); }
        const ids = [...new Set(links.filter((l) => String(l.platform) === "0").map((l) => String(l.platformId)))];
        if (cmd === "unlink") { const n = links.filter((l) => Number(l.accountId) !== Number(rec.accountId)); fs.writeFileSync(LINKS, JSON.stringify(n, null, 2)); console.log(`Unlinked ${rec.username} (${links.length - n.length} link(s) removed). Restart the server.`); return; }
        if (!ids.length) { console.log("No platform id known yet: log in once on this client first, then run this again."); process.exit(1); }
        if (!multi) { console.log("auth.js is NOT patched for several accounts (run: node apply-multiacct.js). Linking would replace the existing account in the picker, so I stopped."); process.exit(1); }
        let added = 0;
        for (const pid of ids) if (!links.some((l) => String(l.platform) === "0" && String(l.platformId) === pid && Number(l.accountId) === Number(rec.accountId))) { links.push({ platform: 0, platformId: pid, accountId: Number(rec.accountId), lastLoginTime: new Date().toISOString(), requirePassword: false }); added++; }
        fs.writeFileSync(LINKS, JSON.stringify(links, null, 2));
        console.log(added ? `Linked ${rec.username} (${rec.accountId}) to ${ids.length} platform id(s). Restart the server, then open the account picker in the game.` : `${rec.username} was already linked.`);
        return;
    }
    console.log(`Several accounts on one client: auth.js ${multi ? "IS patched (ok)" : "is NOT patched - run:  node apply-multiacct.js   then restart"}\n`);
    const byId = new Map();
    for (const l of links) { const k = l.platform + "/" + l.platformId; (byId.get(k) || byId.set(k, []).get(k)).push(l); }
    if (!byId.size) console.log("No links at all: nobody has logged in on this server yet.");
    for (const [k, ls] of byId) {
        console.log(`Platform id ${k} - the picker on that client shows ${ls.length} account(s):`);
        for (const l of ls) { let n = "?"; try { n = (await find(String(l.accountId))).username; } catch {} console.log(`   ${String(l.accountId).padEnd(11)} ${n}`); }
    }
    let all = []; try { all = await pb.collection(pb.hydriumCollections.accounts).getFullList(); } catch {}
    const linked = new Set(links.map((l) => Number(l.accountId)));
    const loose = all.filter((a) => !linked.has(Number(a.accountId)));
    if (loose.length) { console.log("\nAccounts that exist but are in NO picker (they appear after their first login here, or link them):"); for (const a of loose) console.log(`   ${String(a.accountId).padEnd(11)} ${a.username}   ->  node accounts-doctor.js link ${a.username}`); }
    if (!multi) process.exit(1);
})();