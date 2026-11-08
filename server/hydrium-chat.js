"use strict";

// Hydrium - direct-message chat threads, shapes from RecFlare (apps/chat/src/chat.app.ts).
//   GET  /thread?maxCount=&mode=          the caller's threads, newest first (latestMessage included)
//   POST /thread                           open a thread with the given ids and post the first message
//   POST /thread/withmembers               open (or find) the thread with these ids; page of messages
//   GET  /thread/:id                       the thread with a page of messages (newest first)
//   POST /thread/:id, /thread/:id/message  send a message
//   GET  /thread/:id/message               messages, newest first, a bare array
//   POST|PUT /thread/:id/read, /thread/:id/message/:messageId/read, /rename, /leave, /snooze, /favorite
// Threads and messages are kept in data/chat.json (override CHAT_FILE).
//
// Not done: pushing a new message to the other player live. They see it when their game next asks
// for its threads. /thread/party (parties) stays with chat.js.
//
// Mount in index.js before app.use(chat), e.g. after the hydrium-rooms line:
//   app.use(require("./hydrium-chat").router);

const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const router = express.Router();
const FILE = path.resolve(process.env.CHAT_FILE || path.join(__dirname, "data", "chat.json"));
const MAX_MEMBERS = 50;
const DEFAULT_THREAD_MESSAGES = 50;
const MAX_COUNT = 100;
const SUCCESS = 0;
const INVALID_ARGUMENTS = 1;

let db = { nextThreadId: 1, nextMessageId: 1, threads: {} };
try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (j && j.threads) db = { nextThreadId: j.nextThreadId || 1, nextMessageId: j.nextMessageId || 1, threads: j.threads };
} catch {
    /* first run */
}
function persist() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(db));
    fs.renameSync(FILE + ".tmp", FILE);
}

function me(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const n = Number(jwt.verify(h.slice(7).trim(), process.env.HYDRIUM_JWT_SECRET || "hydrium-development-secret").sub);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

const body = [express.urlencoded({ extended: true }), express.json({ type: () => true, limit: "200kb" })];
const parse = (req, res, next) => body[0](req, res, (e) => (e ? next(e) : body[1](req, res, next)));
const field = (req, name) => {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const k = Object.keys(b).find((x) => x.toLowerCase() === name.toLowerCase());
    const v = k !== undefined ? b[k] : req.query[name];
    return Array.isArray(v) ? v[0] : v;
};
function memberIds(req) {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const k = Object.keys(b).find((x) => x.toLowerCase() === "ids" || x.toLowerCase() === "ids[]");
    const raw = [k ? b[k] : undefined, req.query.ids].flat().filter((v) => v !== undefined).map(String);
    return [...new Set(raw.flatMap((v) => v.split(",")).map((v) => Number.parseInt(v.trim(), 10)).filter((n) => Number.isSafeInteger(n) && n > 0))];
}
const countOf = (req, fallback) => {
    const n = Number.parseInt(String(field(req, "messageCount") ?? field(req, "maxCount") ?? ""), 10);
    return Number.isNaN(n) || n <= 0 ? fallback : Math.min(n, MAX_COUNT);
};

// ---------- views ----------

const iso = (t) => new Date(t).toISOString();
const msgView = (t, m) => ({ chatMessageId: m.id, chatThreadId: t.id, senderPlayerId: m.sender, timeSent: iso(m.time), contents: m.contents, moderationState: 0 });
const sentView = (t, m) => ({ ChatMessageId: m.id, ChatThreadId: t.id, SenderPlayerId: m.sender, TimeSent: iso(m.time), Contents: m.contents, ModerationState: 0 });

function base(t, viewer) {
    const st = (t.state && t.state[viewer]) || {};
    return {
        chatThreadId: t.id,
        playerIds: [...t.members].sort((a, b) => a - b),
        lastReadMessageId: st.lastRead || 0,
        chatThreadName: t.name || "",
        chatThreadType: 0,
        snoozedUntil: st.snoozedUntil || null,
        isFavorited: !!st.favorited,
    };
}
const listView = (t, viewer) => ({ latestMessage: t.messages.length ? msgView(t, t.messages[t.messages.length - 1]) : null, ...base(t, viewer) });
const fullView = (t, viewer, limit) => ({ ...base(t, viewer), messages: t.messages.slice(-limit).reverse().map((m) => msgView(t, m)) });

// ---------- logic ----------

const sameMembers = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
function openThread(members) {
    const found = Object.values(db.threads).find((t) => t.type === 0 && sameMembers(t.members, members));
    if (found) return { thread: found, created: false };
    const t = { id: db.nextThreadId++, type: 0, name: "", members: [...members], messages: [], state: {}, createdAt: Date.now() };
    db.threads[t.id] = t;
    return { thread: t, created: true };
}
function post(t, sender, contents) {
    const m = { id: db.nextMessageId++, sender, time: Date.now(), contents };
    t.messages.push(m);
    ((t.state ||= {})[sender] ||= {}).lastRead = m.id;
    return m;
}
const mine = (id, viewer) => {
    const t = db.threads[id];
    return t && t.members.includes(viewer) ? t : null;
};
const authed = (fn) => (req, res, next) => {
    const viewer = me(req);
    if (!viewer) return res.status(401).end();
    return fn(req, res, viewer, next);
};
const numeric = (name, fn) => (req, res, next) => (/^\d+$/.test(req.params[name]) ? fn(req, res, next) : next());

// ---------- routes ----------

router.get("/thread", authed((req, res, viewer) => {
    const limit = countOf(req, DEFAULT_THREAD_MESSAGES);
    const threads = Object.values(db.threads)
        .filter((t) => t.type === 0 && t.members.includes(viewer))
        .sort((a, b) => ((b.messages.at(-1)?.time ?? b.createdAt) - (a.messages.at(-1)?.time ?? a.createdAt)))
        .slice(0, limit);
    console.log(`[CHAT+] ${viewer} lists ${threads.length} thread(s)`);
    res.status(200).json(threads.map((t) => listView(t, viewer)));
}));

router.post("/thread", parse, authed((req, res, viewer) => {
    const members = [...new Set([viewer, ...memberIds(req)])];
    if (members.length < 2 || members.length > MAX_MEMBERS) return res.status(400).end();
    const { thread, created } = openThread(members);
    const contents = String(field(req, "messageContents") ?? "").trim();
    if (contents) post(thread, viewer, contents);
    if (created || contents) persist();
    console.log(`[CHAT+] ${viewer} opened thread ${thread.id}${contents ? " and posted" : ""}`);
    res.status(200).json({ chatThread: listView(thread, viewer), chatResult: contents ? SUCCESS : INVALID_ARGUMENTS });
}));

router.post("/thread/withmembers", parse, authed((req, res, viewer) => {
    const members = [...new Set([viewer, ...memberIds(req)])];
    if (members.length < 2 || members.length > MAX_MEMBERS) return res.status(400).end();
    const { thread, created } = openThread(members);
    if (created) persist();
    res.status(200).json(fullView(thread, viewer, countOf(req, DEFAULT_THREAD_MESSAGES)));
}));

router.get("/thread/:id", numeric("id", authed((req, res, viewer) => {
    const t = mine(req.params.id, viewer);
    if (!t) return res.status(404).end();
    res.status(200).json(fullView(t, viewer, countOf(req, DEFAULT_THREAD_MESSAGES)));
})));

function send(req, res, viewer) {
    const t = mine(req.params.id, viewer);
    if (!t) return res.status(404).end();
    const contents = String(field(req, "messageContents") ?? "").trim();
    const m = contents ? post(t, viewer, contents) : null;
    if (m) {
        persist();
        console.log(`[CHAT+] ${viewer} -> thread ${t.id}: message ${m.id}`);
    }
    const result = m ? SUCCESS : INVALID_ARGUMENTS;
    res.status(200).json({ ChatMessage: m ? sentView(t, m) : null, ChatResult: result, chatResult: result, chatThread: fullView(t, viewer, countOf(req, DEFAULT_THREAD_MESSAGES)) });
}
router.post("/thread/:id", parse, numeric("id", authed(send)));
router.post("/thread/:id/message", parse, numeric("id", authed(send)));

router.get("/thread/:id/message", numeric("id", authed((req, res, viewer) => {
    const t = mine(req.params.id, viewer);
    if (!t) return res.status(404).end();
    res.status(200).json(t.messages.slice(-countOf(req, 50)).reverse().map((m) => msgView(t, m)));
})));

// read pointer: only moves forward, never past the real latest message
function markRead(req, res, viewer) {
    const t = mine(req.params.id, viewer);
    if (!t) return res.status(404).end();
    const latest = t.messages.at(-1)?.id ?? 0;
    const asked = req.params.messageId !== undefined ? Number.parseInt(req.params.messageId, 10) : latest;
    const st = ((t.state ||= {})[viewer] ||= {});
    st.lastRead = Math.max(st.lastRead || 0, Math.min(Number.isNaN(asked) ? latest : asked, latest));
    persist();
    res.status(200).json(SUCCESS);
}
for (const method of ["post", "put"]) {
    router[method]("/thread/:id/read", parse, numeric("id", authed(markRead)));
    router[method]("/thread/:id/message/:messageId/read", parse, numeric("id", authed(markRead)));
}

function setting(fn) {
    return (req, res, viewer) => {
        const t = mine(req.params.id, viewer);
        if (!t) return res.status(404).end();
        fn(t, req, viewer, (t.state ||= {})[viewer] ||= {});
        persist();
        res.status(200).json(SUCCESS);
    };
}
for (const method of ["post", "put"]) {
    router[method]("/thread/:id/rename", parse, numeric("id", authed(setting((t, req) => (t.name = String(field(req, "name") ?? "").slice(0, 128))))));
    router[method]("/thread/:id/snooze", parse, numeric("id", authed(setting((t, req, v, st) => {
        const s = String(field(req, "snooze") ?? "").toLowerCase();
        st.snoozedUntil = s === "true" || s === "1" ? new Date(Date.now() + 8 * 3600e3).toISOString() : null;
    }))));
    router[method]("/thread/:id/favorite", parse, numeric("id", authed(setting((t, req, v, st) => {
        const s = String(field(req, "favorite") ?? field(req, "favorited") ?? field(req, "isFavorited") ?? "").toLowerCase();
        st.favorited = s === "true" || s === "1";
    }))));
    router[method]("/thread/:id/leave", parse, numeric("id", authed((req, res, viewer) => {
        const t = mine(req.params.id, viewer);
        if (!t) return res.status(404).end();
        t.members = t.members.filter((m) => m !== viewer);
        if (t.members.length === 0) delete db.threads[t.id];
        persist();
        res.status(200).json(SUCCESS);
    })));
}

module.exports = { router };
