"use strict";

// Hydrium - account endpoints, shapes taken from RecFlare (apps/accounts/src/accounts.app.ts).
// Replaces/extends accounts.js for:
//   GET  /account/me                  (adds email, birthday, availableUsernameChanges, isDeleted)
//   GET  /account/bulk, POST /account/bulk   every requested id is answered (unknown ids get a default)
//   GET  /account/search?name=&take=, /account/username/:name, /account/:id, /account/:id/bio
//   GET  /accountprivacysettings/:id, /parentalcontrol/me, /emojiConfig/whitelistedEmojis
//   PUT  /account/me/displayname | username | bio | emoji | personalpronouns | identityflags
//        | bannerimage | profileimage         POST /account/me/phone | email, GET .../email/pending
// (this file also handles PUT /account/me/profileimage, so hydrium-profile.js is no longer needed)
//
// Bio, remaining username changes, email and phone are kept in data/account-extra.json
// (override ACCOUNT_EXTRA_FILE) - the PocketBase collection has no fields for them.
//
// Mount in index.js before app.use(auth), e.g. after the hydrium-rooms line:
//   app.use(require("./hydrium-accounts").router);

const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const pb = require("./pb");

const router = express.Router();
const COLLECTION = pb.hydriumCollections.accounts;
const SECRET = process.env.HYDRIUM_JWT_SECRET || "hydrium-development-secret";
const DEFAULT_USERNAME_CHANGES = 3;
const SEARCH_LIMIT = 20;
const MAX_DISPLAY_NAME = 15;
const MAX_USERNAME = 50;
const MAX_BIO = 255;

let EMOJIS = [];
try {
    EMOJIS = JSON.parse(fs.readFileSync(path.join(__dirname, "emojis.json"), "utf8"));
} catch {
    /* emojis.json missing: the picker list stays empty and emoji can't be set */
}
const emojiByStripped = new Map(EMOJIS.map((e) => [e.replaceAll("️", ""), e]));

// ---------- extras (bio, username changes, email, phone) ----------

const EXTRA_FILE = path.resolve(process.env.ACCOUNT_EXTRA_FILE || path.join(__dirname, "data", "account-extra.json"));
let extra = {};
try {
    extra = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8")) || {};
} catch {
    /* first run */
}
function saveExtra() {
    fs.mkdirSync(path.dirname(EXTRA_FILE), { recursive: true });
    fs.writeFileSync(EXTRA_FILE + ".tmp", JSON.stringify(extra, null, 2));
    fs.renameSync(EXTRA_FILE + ".tmp", EXTRA_FILE);
}
const extraOf = (id) => extra[id] || {};
function setExtra(id, patch) {
    extra[id] = { ...extraOf(id), ...patch };
    saveExtra();
}

// ---------- accounts ----------

const iso = (v) => {
    if (!v) return new Date().toISOString();
    const d = new Date(String(v).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

async function findRecord(accountId) {
    try {
        return await pb.collection(COLLECTION).getFirstListItem(`accountId = ${Number(accountId)}`);
    } catch (err) {
        if (err && (err.status === 404 || err.status === 400)) return null;
        throw err;
    }
}

function toDto(rec, id) {
    if (!rec) {
        return { accountId: id, username: `Player${id}`, displayName: `Player${id}`, profileImage: "DefaultProfileImage.jpg", bannerImage: "", displayEmoji: "", isJunior: false, platforms: 0, personalPronouns: 0, identityFlags: 0, createdAt: new Date().toISOString() };
    }
    return {
        accountId: Number(rec.accountId),
        username: rec.username || "",
        displayName: rec.displayName || rec.username || "",
        profileImage: rec.profileImage || "DefaultProfileImage.jpg",
        bannerImage: rec.bannerImage || "",
        displayEmoji: rec.displayEmoji || "",
        isJunior: rec.isJunior === true,
        platforms: rec.platforms ?? 0,
        personalPronouns: rec.personalPronouns ?? 0,
        identityFlags: rec.identityFlags ?? 0,
        createdAt: iso(rec.createdAt || rec.created),
    };
}

function toSelfDto(rec, id) {
    const x = extraOf(id);
    return {
        ...toDto(rec, id),
        email: x.email || "",
        birthday: "1904-01-01T00:00:00.000Z",
        availableUsernameChanges: Number.isFinite(x.usernameChanges) ? x.usernameChanges : DEFAULT_USERNAME_CHANGES,
        isDeleted: false,
    };
}

// ---------- helpers ----------

function me(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const n = Number(jwt.verify(h.slice(7).trim(), SECRET).sub);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

const parsers = [express.urlencoded({ extended: true }), express.json({ type: () => true, limit: "100kb" })];
function parse(req, res, next) {
    parsers[0](req, res, (e) => (e ? next(e) : parsers[1](req, res, next)));
}
// field from a form or JSON body (names matched case-insensitively), then the query string
function field(req, name) {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const k = Object.keys(b).find((x) => x.toLowerCase() === name.toLowerCase());
    const v = k !== undefined ? b[k] : req.query[name];
    return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}

function idList(req) {
    const raw = [];
    for (const src of [req.query.id, req.body && typeof req.body === "object" ? req.body.id : undefined]) {
        if (src === undefined) continue;
        raw.push(...(Array.isArray(src) ? src : [src]).map(String));
    }
    return [...new Set(raw.flatMap((v) => v.split(",")).map((v) => Number.parseInt(v.trim(), 10)).filter((n) => !Number.isNaN(n)))];
}

async function updateRecord(id, patch) {
    const rec = await findRecord(id);
    if (!rec) throw Object.assign(new Error("account not found"), { status: 404 });
    return pb.collection(COLLECTION).update(rec.id, patch);
}

const unauthorized = (res) => res.status(401).end();
const guard = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    } catch (err) {
        console.error(`[ACCOUNTS+] ${req.method} ${req.path} failed:`, err.message);
        if (!res.headersSent) res.status(err.status === 404 ? 404 : 500).json({ success: false, error: err.message });
    }
};

// ---------- reads ----------

router.get("/emojiConfig/whitelistedEmojis", (req, res) => res.status(200).json(EMOJIS));

router.get("/parentalcontrol/me", (req, res) => {
    const id = me(req);
    if (!id) return unauthorized(res);
    res.status(200).json({ accountId: id, disallowInAppPurchases: true });
});

router.get("/accountprivacysettings/:id", (req, res, next) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!/^\d+$/.test(req.params.id)) return next();
    res.status(200).json({ accountId: id, isRecentHistoryVisible: true });
});

router.get("/account/me", guard(async (req, res) => {
    const id = me(req);
    if (!id) return unauthorized(res);
    res.status(200).json(toSelfDto(await findRecord(id), id));
}));

async function bulk(req, res) {
    const ids = idList(req);
    const out = [];
    for (const id of ids) out.push(toDto(await findRecord(id), id));
    console.log(`[ACCOUNTS+] bulk ${ids.length} id(s)`);
    res.status(200).json(out);
}
router.get("/account/bulk", guard(bulk));
router.post("/account/bulk", parse, guard(bulk));

router.get("/account/search", guard(async (req, res) => {
    const q = String(req.query.name || "").trim().toLowerCase();
    const take = Number.parseInt(String(req.query.take || ""), 10);
    const limit = Number.isNaN(take) ? SEARCH_LIMIT : Math.max(1, Math.min(take, SEARCH_LIMIT));
    if (!q) return res.status(200).json([]);
    const list = await pb.collection(COLLECTION).getList(1, 200, { filter: pb.filter("username ~ {:q}", { q }), sort: "username" });
    const hits = list.items.filter((r) => String(r.username || "").toLowerCase().startsWith(q)).slice(0, limit);
    res.status(200).json(hits.map((r) => toDto(r, Number(r.accountId))));
}));

router.get("/account/username/:name", guard(async (req, res) => {
    const name = String(req.params.name).trim().replace(/^@/, "");
    let rec = null;
    if (name) {
        try {
            rec = await pb.collection(COLLECTION).getFirstListItem(pb.filter("username = {:n}", { n: name }));
        } catch {
            const list = await pb.collection(COLLECTION).getList(1, 200, { filter: pb.filter("username ~ {:n}", { n: name }) });
            rec = list.items.find((r) => String(r.username).toLowerCase() === name.toLowerCase()) || null;
        }
    }
    if (!rec) return res.status(404).json({ error: `There's no player called @${name}.` });
    res.status(200).json(toDto(rec, Number(rec.accountId)));
}));

router.get("/account/:id/bio", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const accountId = Number.parseInt(req.params.id, 10);
    res.status(200).json({ accountId, bio: extraOf(accountId).bio || "" });
});

router.get("/account/:id", guard(async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const id = Number.parseInt(req.params.id, 10);
    res.status(200).json(toDto(await findRecord(id), id));
}));

// ---------- writes (the signed-in player's own profile) ----------

function put(pathName, handler, method = "put") {
    router[method](`/account/me/${pathName}`, parse, guard(async (req, res) => {
        const id = me(req);
        if (!id) return unauthorized(res);
        await handler(id, req, res);
    }));
}
const ok = (res) => res.status(200).json({ success: true });

put("displayname", async (id, req, res) => {
    const displayName = field(req, "displayName").trim();
    if (!displayName || [...displayName].length > MAX_DISPLAY_NAME || !/^[\p{Script=Latin}\p{N}\s.,'!?_&()#@:+\-]+$/u.test(displayName)) return res.status(400).end();
    await updateRecord(id, { displayName });
    console.log(`[ACCOUNTS+] ${id} displayName = ${displayName}`);
    ok(res);
});

// Always HTTP 200; failures carry the message in `error`
put("username", async (id, req, res) => {
    const reply = (error = "", value = "") => res.status(200).json({ success: error === "", error, value });
    const username = field(req, "username").trim();
    if (!username) return reply("You must enter a username.");
    if (username.length > MAX_USERNAME) return reply(`Your username can be at most ${MAX_USERNAME} characters.`);
    if (!/^[A-Za-z0-9]+$/.test(username)) return reply("Your username can only contain letters and numbers.");
    const taken = await pb.collection(COLLECTION).getList(1, 5, { filter: pb.filter("username = {:n}", { n: username }) });
    if (taken.items.some((r) => Number(r.accountId) !== id)) return reply("That username is already taken.");
    const remaining = Number.isFinite(extraOf(id).usernameChanges) ? extraOf(id).usernameChanges : DEFAULT_USERNAME_CHANGES;
    if (remaining <= 0) return reply("You have no username changes remaining.");
    const rec = await updateRecord(id, { username });
    setExtra(id, { usernameChanges: remaining - 1 });
    console.log(`[ACCOUNTS+] ${id} username = ${username}`);
    reply("", toDto(rec, id));
});

put("bio", async (id, req, res) => {
    const bio = field(req, "bio");
    if (bio.length > MAX_BIO) return res.status(400).end();
    setExtra(id, { bio });
    ok(res);
});

put("emoji", async (id, req, res) => {
    const submitted = field(req, "displayEmoji").trim();
    const displayEmoji = submitted === "" ? "" : emojiByStripped.get(submitted.replaceAll("️", ""));
    if (displayEmoji === undefined) return res.status(400).end();
    await updateRecord(id, { displayEmoji });
    ok(res);
});

put("personalpronouns", async (id, req, res) => {
    const n = Number.parseInt(field(req, "pronounFlags").trim(), 10);
    if (Number.isNaN(n)) return res.status(400).end();
    await updateRecord(id, { personalPronouns: n });
    ok(res);
});

put("identityflags", async (id, req, res) => {
    const n = Number.parseInt(field(req, "identityFlags").trim(), 10);
    if (Number.isNaN(n)) return res.status(400).end();
    await updateRecord(id, { identityFlags: n });
    ok(res);
});

for (const [route, column] of [["bannerimage", "bannerImage"], ["profileimage", "profileImage"]]) {
    put(route, async (id, req, res) => {
        const imageName = field(req, "imageName").trim();
        // an object key: file name or folders of it (sharecamera/<date>/<uuid>.jpg), nothing odd
        if (!imageName || imageName.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(imageName) || imageName.includes("..")) return res.status(400).end();
        await updateRecord(id, { [column]: imageName });
        console.log(`[ACCOUNTS+] ${id} ${column} = ${imageName}`);
        ok(res);
    });
}

// No mail service on Hydrium: an address is just stored, and there is nothing to confirm.
put("phone", async (id, req, res) => {
    setExtra(id, { phone: field(req, "phone").trim().slice(0, 40) });
    ok(res);
}, "post");
put("email", async (id, req, res) => {
    const email = field(req, "email").trim();
    if (!email || email.length > 200 || !/^[^@\s]+@[^@\s]+$/.test(email)) return res.status(400).end();
    setExtra(id, { email });
    ok(res);
}, "post");
router.get("/account/me/email/pending", (req, res) => {
    if (!me(req)) return unauthorized(res);
    res.status(200).json({ pending: null, sentTo: null });
});
router.post("/account/me/email/confirm", (req, res) => {
    if (!me(req)) return unauthorized(res);
    res.status(400).json({ success: false, error: "There is nothing to confirm." });
});

module.exports = { router };
