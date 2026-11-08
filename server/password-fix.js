// Hydrium server: username + password login for accounts, and a way to set a password from the game.
//
// Drop-in module: it does not change auth.js. Copy it into the server folder (next to auth.js) and add ONE line in index.js,
// before `app.use(auth);`:
//
//     app.use(require("./password-fix"));
//
// What it does
//  1. POST /connect/token (grant_type=password): before auth.js runs, checks the typed username + password against PocketBase.
//     If PocketBase does not accept the username as a login name, the account is looked up by username and its e-mail is used
//     instead (an e-mail is always a PocketBase login name); auth.js then gets that e-mail as `username` and its own
//     authWithPassword() succeeds. The console tells WHY a login fails ("no account with this username" or "the password is
//     wrong"); auth.js only ever answers 401 invalid_grant.
//  2. GET  /account/me/haspassword   - the game's "Create password" / "Change password" screens ask this first.
//  3. POST /account/me/changepassword - sets the password of the signed-in account (Bearer token from the game).
//     Accounts that the game created through Steam / the platform get a RANDOM password (auth.js, create_account), so nobody
//     knows it; the first time you set one here no old password is needed, later changes check the old one.
//     NOTE: the exact request/response shapes of 2. and 3. were not captured from the real game. Both routes log what they
//     receive (key names only, never values) so a wrong guess can be corrected from the console.
//
// Passwords are never logged.

const fs = require("fs");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");

const pb = require("./pb");

const ACCOUNT_COLLECTION = pb.hydriumCollections.accounts;
const JWT_SECRET = process.env.HYDRIUM_JWT_SECRET;          // the same secret auth.js signs the tokens with
const MIN_PASSWORD = 8;                                       // PocketBase's own minimum for auth collections

const router = express.Router();
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

// ---------------------------------------------------------
// helpers
// ---------------------------------------------------------

// The server shares ONE PocketBase client; a successful authWithPassword signs it in as that user. Put the client back the
// way it was so that nothing else is affected.
function saveAuth() {
    return { token: pb.authStore.token, record: pb.authStore.record || pb.authStore.model };
}
function restoreAuth(saved) {
    if (saved.token) {
        pb.authStore.save(saved.token, saved.record);
    } else {
        pb.authStore.clear();
    }
}

function first(obj, names) {
    for (const n of names) {
        if (obj && typeof obj[n] === "string" && obj[n] !== "") {
            return obj[n];
        }
    }
    return "";
}

async function findByUsername(name) {
    return pb.collection(ACCOUNT_COLLECTION).getFirstListItem(pb.filter("username = {:u}", { u: name }));
}

async function findByAccountId(accountId) {
    const id = Number(accountId);
    if (!Number.isSafeInteger(id)) {
        throw new Error("invalid accountId");
    }
    return pb.collection(ACCOUNT_COLLECTION).getFirstListItem(pb.filter("accountId = {:id}", { id }));
}

// Which accounts have a password that a person set (not the random one the server made). A small file next to this module.
const MARKER_FILE = path.join(__dirname, "data", "password-set.json");

function readMarkers() {
    try {
        return JSON.parse(fs.readFileSync(MARKER_FILE, "utf8"));
    } catch (_) {
        return {};
    }
}
function markPasswordSet(accountId) {
    try {
        const m = readMarkers();
        m[String(accountId)] = new Date().toISOString();
        fs.mkdirSync(path.dirname(MARKER_FILE), { recursive: true });
        fs.writeFileSync(MARKER_FILE, JSON.stringify(m, null, 2));
    } catch (err) {
        console.log("[PWFIX] could not write", MARKER_FILE, err.message);
    }
}

function accountFromBearer(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ") || !JWT_SECRET) {
        return null;
    }
    try {
        const decoded = jwt.verify(auth.substring(7).trim(), JWT_SECRET);
        return decoded && decoded.sub ? decoded : null;
    } catch (err) {
        console.log("[PWFIX] invalid token:", err.message);
        return null;
    }
}

// ---------------------------------------------------------
// 1. password login: make the username work whatever PocketBase's login-name settings are
// ---------------------------------------------------------

router.post("/connect/token", async (req, res, next) => {
    const body = req.body || {};
    const grant = body.grant_type;
    if ((grant === "password" || !grant) && body.username && body.password) {
        const saved = saveAuth();
        try {
            const name = String(body.username).trim();
            const password = String(body.password);
            const col = pb.collection(ACCOUNT_COLLECTION);
            let accepted = false;
            try {
                await col.authWithPassword(name, password);
                accepted = true;                                   // PocketBase takes the username as a login name: nothing to change
            } catch (_) { /* try the e-mail below */ }

            if (!accepted) {
                let record = null;
                try {
                    record = await findByUsername(name);
                } catch (_) { /* no such username */ }

                if (!record) {
                    console.log(`[PWFIX] login '${name}': no account with this username`);
                } else if (!record.email) {
                    console.log(`[PWFIX] login '${name}': account ${record.accountId} has no e-mail to log in with`);
                } else {
                    try {
                        await col.authWithPassword(record.email, password);
                        body.username = record.email;              // auth.js signs in with this and succeeds
                        console.log(`[PWFIX] login '${name}': username is not a PocketBase login name, used the e-mail of account ${record.accountId}`);
                    } catch (_) {
                        console.log(`[PWFIX] login '${name}': account ${record.accountId} exists but the password was rejected` +
                            (readMarkers()[String(record.accountId)] ? "" : " (if the game made this account through Steam / the platform login, its password is still the random one nobody knows: set one with the in-game Create password screen or set-password.js)"));
                    }
                }
            }
        } catch (err) {
            console.log("[PWFIX] login check failed:", err.message);
        } finally {
            restoreAuth(saved);
        }
    }
    next();
});

// ---------------------------------------------------------
// 2. GET /account/me/haspassword
// ---------------------------------------------------------

router.get("/account/me/haspassword", (req, res) => {
    const decoded = accountFromBearer(req);
    if (!decoded) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const has = Boolean(readMarkers()[String(decoded.sub)]);
    console.log(`[PWFIX] haspassword accountId=${decoded.sub} -> ${has}`);
    return res.status(200).json(has);
});

// ---------------------------------------------------------
// 3. POST /account/me/changepassword
// ---------------------------------------------------------

router.post("/account/me/changepassword", async (req, res) => {
    const decoded = accountFromBearer(req);
    if (!decoded) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const body = req.body || {};
    console.log(`[PWFIX] changepassword accountId=${decoded.sub} content-type=${req.headers["content-type"] || "-"} keys=${Object.keys(body).join(",") || "(none)"}`);

    const newPassword = first(body, ["newPassword", "NewPassword", "new_password", "password", "Password"]);
    const oldPassword = first(body, ["oldPassword", "OldPassword", "old_password", "currentPassword", "CurrentPassword"]);

    if (newPassword.length < MIN_PASSWORD) {
        return res.status(400).json({ success: false, error: `The password must be at least ${MIN_PASSWORD} characters` });
    }

    const saved = saveAuth();
    try {
        pb.authStore.clear();
        const record = await findByAccountId(decoded.sub);

        // The old password is only checked once a person has set one; before that it is the random one nobody knows.
        if (readMarkers()[String(record.accountId)]) {
            let ok = false;
            if (oldPassword) {
                try {
                    await pb.collection(ACCOUNT_COLLECTION).authWithPassword(record.email || record.username, oldPassword);
                    ok = true;
                } catch (_) { /* wrong */ }
                pb.authStore.clear();
            }
            if (!ok) {
                console.log(`[PWFIX] changepassword accountId=${record.accountId}: old password missing or wrong`);
                return res.status(400).json({ success: false, error: "Invalid old password" });
            }
        }

        await pb.collection(ACCOUNT_COLLECTION).update(record.id, { password: newPassword, passwordConfirm: newPassword });
        markPasswordSet(record.accountId);
        console.log(`[PWFIX] password set - accountId=${record.accountId} username=${record.username}`);
        return res.status(200).json({ success: true, error: "" });
    } catch (err) {
        console.log("[PWFIX] changepassword failed:", err.status || "", (err.response && err.response.message) || err.message);
        return res.status(400).json({ success: false, error: "Could not change the password" });
    } finally {
        restoreAuth(saved);
    }
});

module.exports = router;