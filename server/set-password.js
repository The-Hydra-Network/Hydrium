// Sets the password of one Hydrium account directly in PocketBase.
//
//   cd <the server folder>          (the one with .env, pb.js and node_modules)
//   node set-password.js <username or 9-digit accountId> <new password>
//
// Use it for accounts that the game created through Steam: those got a random password, so username + password login can never
// work until a password is set. Needs the same .env as the server (POCKETBASE_URL). If PocketBase refuses the update (403/404),
// set the password in the PocketBase admin page instead: collection hydrium_accounts -> the account -> password.
// Note: a password given on the command line stays in the shell history.

require("dotenv").config();
const pb = require("./pb");

const [, , who, newPassword] = process.argv;
if (!who || !newPassword) {
    console.log("usage: node set-password.js <username or accountId> <new password (at least 8 characters)>");
    process.exit(2);
}
if (newPassword.length < 8) {
    console.log("The password must be at least 8 characters.");
    process.exit(2);
}

(async () => {
    const col = pb.collection(pb.hydriumCollections.accounts);
    let record;
    try {
        record = /^\d{6,}$/.test(who)
            ? await col.getFirstListItem(pb.filter("accountId = {:id}", { id: Number(who) }))
            : await col.getFirstListItem(pb.filter("username = {:u}", { u: who }));
    } catch (err) {
        console.log(`No account found for '${who}' (${err.status || err.message}).`);
        process.exit(1);
    }
    try {
        await col.update(record.id, { password: newPassword, passwordConfirm: newPassword });
        console.log(`Password set for account ${record.accountId} (username ${record.username}). Log in with that username and the new password.`);
    } catch (err) {
        console.log("PocketBase refused the update:", err.status || "", (err.response && err.response.message) || err.message);
        console.log("Set the password in the PocketBase admin page instead (hydrium_accounts -> the account -> password).");
        process.exit(1);
    }
})();