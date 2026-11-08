"use strict";

// Hydrium - friendships (/api/relationships/*)
//
// Replaces the stub that returned [] for everything. Data is kept in
// data/friends.json (override with FRIENDS_FILE).
//
// Relationship as the game sees it (one record per other player):
//   { Id, PlayerID, RelationshipType, Favorited, Muted, Ignored }
//   RelationshipType: 0 none, 1 request sent by me, 2 request received, 3 friends
//
// Actions (GET or POST, player in ?id= or the body's id / playerId / accountId):
//   sendfriendrequest   - sends a request; if they already asked you, you become friends
//   acceptfriendrequest - accept a received request
//   declinefriendrequest / cancelfriendrequest / removefriend - delete the relationship
//   ignore / unignore, mute / unmute, favorite / unfavorite
//
// Mount it in index.js before app.use(api), e.g. after the hydrium-rooms line:
//   app.use(require("./hydrium-friends").router);

const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const router = express.Router();

const FILE = path.resolve(process.env.FRIENDS_FILE || path.join(__dirname, "data", "friends.json"));
const NONE = 0, SENT = 1, RECEIVED = 2, FRIEND = 3;

// ---------- store ----------
// db.rel[me][other] = { id, type, favorited, muted, ignored }

let db = { nextId: 1, rel: {} };
try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (j && j.rel) db = { nextId: Number(j.nextId) || 1, rel: j.rel };
} catch {
    /* first run */
}

function persist() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, FILE);
}

const get = (me, other) => (db.rel[me] && db.rel[me][other]) || null;
function ensure(me, other) {
    db.rel[me] ||= {};
    return (db.rel[me][other] ||= { id: db.nextId++, type: NONE, favorited: 0, muted: 0, ignored: 0 });
}
// A record with no type and no flags is just removed.
function tidy(me, other) {
    const r = get(me, other);
    if (r && r.type === NONE && !r.favorited && !r.muted && !r.ignored) delete db.rel[me][other];
}

const view = (other, r) => ({
    Id: r ? r.id : 0,
    PlayerID: Number(other),
    RelationshipType: r ? r.type : NONE,
    Favorited: r ? r.favorited : 0,
    Muted: r ? r.muted : 0,
    Ignored: r ? r.ignored : 0,
});

function list(me) {
    const mine = db.rel[me] || {};
    return Object.keys(mine).map((o) => view(o, mine[o]));
}

// ---------- actions ----------

const ACTIONS = {
    sendfriendrequest(me, other) {
        const mine = ensure(me, other);
        const theirs = ensure(other, me);
        if (mine.type === FRIEND) return;
        if (theirs.ignored) {
            // they ignored you: pretend it worked, but never tell them
            mine.type = SENT;
            return;
        }
        if (mine.type === RECEIVED) {
            mine.type = theirs.type = FRIEND; // they had already asked
        } else {
            mine.type = SENT;
            theirs.type = RECEIVED;
        }
    },
    acceptfriendrequest(me, other) {
        const mine = get(me, other);
        if (!mine || mine.type !== RECEIVED) return;
        mine.type = FRIEND;
        ensure(other, me).type = FRIEND;
    },
    removefriend(me, other) {
        for (const [a, b] of [[me, other], [other, me]]) {
            const r = get(a, b);
            if (r) r.type = NONE;
            tidy(a, b);
        }
    },
    ignore(me, other) {
        ensure(me, other).ignored = 1;
        ACTIONS.removefriend(me, other);
        ensure(me, other).ignored = 1;
    },
    unignore(me, other) {
        const r = get(me, other);
        if (r) r.ignored = 0;
        tidy(me, other);
    },
    mute: (me, other) => void (ensure(me, other).muted = 1),
    unmute(me, other) {
        const r = get(me, other);
        if (r) r.muted = 0;
        tidy(me, other);
    },
    favorite(me, other) {
        ensure(me, other).favorited = 1; // works on non-friends too, like RecFlare
    },
    unfavorite(me, other) {
        const r = get(me, other);
        if (r) r.favorited = 0;
        tidy(me, other);
    },
};
ACTIONS.addfriend = (me, other) => {
    // befriend directly, no pending-request step
    ensure(me, other).type = FRIEND;
    ensure(other, me).type = FRIEND;
};
const FLAGS = new Set(["ignore", "unignore", "mute", "unmute", "favorite", "unfavorite", "setfavorite", "removefavorite", "removeignore"]);
ACTIONS.declinefriendrequest =ACTIONS.cancelfriendrequest = ACTIONS.removefriend;
ACTIONS.rejectfriendrequest = ACTIONS.removefriend;
ACTIONS.removeignore = ACTIONS.unignore;
ACTIONS.setfavorite = ACTIONS.favorite;
ACTIONS.removefavorite = ACTIONS.unfavorite;

// ---------- http ----------

function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const d = jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET);
        const id = Number(d.sub);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    } catch {
        return null;
    }
}

function otherId(req) {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const raw = req.query.id ?? req.query.playerId ?? req.query.accountId ?? b.id ?? b.Id ?? b.playerId ?? b.PlayerId ?? b.accountId ?? b.AccountId ?? req.params.id;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const body = express.json({ type: () => true, limit: "100kb" });
const form = express.urlencoded({ extended: true });

router.get("/api/relationships/:v/get", (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ success: false, error: "Unauthorized", value: null });
    const rels = list(me);
    console.log(`[FRIENDS] get ${me}: ${rels.length} relationship(s)`);
    res.status(200).json(rels);
});

function run(action) {
    return (req, res) => {
        const me = accountId(req);
        if (!me) return res.status(401).json({ success: false, error: "Unauthorized", value: null });
        const other = otherId(req);
        if (!other) return res.status(400).json({ success: false, error: "Missing player id", value: null });
        if (other === me) return res.status(400).json({ success: false, error: "Cannot do that to yourself", value: null });
        ACTIONS[action](me, other);
        persist();
        const value = view(other, get(me, other));
        console.log(`[FRIENDS] ${action} ${me} -> ${other}: type=${value.RelationshipType}`);
        // RecFlare: friend actions answer with the caller's relationship itself (bare object);
        // ignore/mute/favorite toggles answer with a plain ack.
        if (FLAGS.has(action)) return res.status(200).json({ success: true, error: "" });
        res.status(200).json(value);
    };
}

for (const action of Object.keys(ACTIONS)) {
    router.all(`/api/relationships/:v/${action}`, (req, res, next) => {
        if (req.method !== "GET" && req.method !== "POST" && req.method !== "PUT" && req.method !== "DELETE") return next();
        body(req, res, (e) => (e ? next(e) : form(req, res, (e2) => (e2 ? next(e2) : run(action)(req, res)))));
    });
    // also the id-in-path form: /api/relationships/v2/<id>/<action>
    router.all(`/api/relationships/:v/:id/${action}`, (req, res, next) => {
        body(req, res, (e) => (e ? next(e) : run(action)(req, res)));
    });
}

module.exports = { router, list, ACTIONS };
