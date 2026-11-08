"use strict";

// Hydrium - live presence + room invites.
//
//  * remembers which room instance every player is in (from their /matchmake/... answers), so a friend
//    shows as being in "Cool_Park" instead of the dorm room (hydrium-presence.js reads it through where()).
//  * POST /invite       records the invite AND pushes it to the invited player over the notification websocket,
//                       so the "X invited you" prompt actually appears for them.
//  * POST /matchmake/player/:id, /matchmake/invite/:id, /matchmake/instance/:id
//                       "join friend" / accept an invite: put the caller in that instance.
//
// MOUNT IT EARLY, before hydrium-fixes2 (which has the old /invite), match and hydrium-presence:
//   app.use(require("./hydrium-live").router);
// Nothing else to change: it watches the websocket upgrades by itself.

const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();
const SECRET = process.env.HYDRIUM_JWT_SECRET || "hydrium-development-secret";
const form = express.urlencoded({ extended: true, limit: "100kb" });
const json = express.json({ type: () => true, limit: "100kb" });
const GAME_INVITE_V2 = 6, GAME_INVITE = 0, PLAY_TOGETHER = 22, MESSAGE_RECEIVED = 2;
const V2_MIN_BUILD = 20230414;

const where = new Map();     // accountId -> { instance, at }
const instances = new Map(); // roomInstanceId -> instance object (as the game was given it)
const invites = new Map();   // inviteId -> { from, to, instance }
let nextInvite = 1;

function who(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try { const c = jwt.verify(h.slice(7).trim(), SECRET); const n = Number(c.sub); return Number.isSafeInteger(n) && n > 0 ? { id: n, claims: c } : null; } catch { return null; }
}
function tokenId(t) { try { const c = jwt.verify(String(t), SECRET); const n = Number(c.sub); return Number.isSafeInteger(n) && n > 0 ? n : null; } catch { return null; } }

// ---------- the room a player is in ----------
function setWhere(id, inst) {
    if (!id) return;
    if (!inst) { if (where.delete(id)) console.log(`[LIVE] ${id} left their room`); return; }
    instances.set(Number(inst.roomInstanceId), inst);
    if (instances.size > 2000) instances.delete(instances.keys().next().value);
    const old = where.get(id);
    where.set(id, { instance: inst, at: Date.now() });
    if (!old || old.instance.roomInstanceId !== inst.roomInstanceId) console.log(`[LIVE] ${id} is in "${inst.name}" (instance ${inst.roomInstanceId})`);
}
const instanceOf = (id) => { const w = where.get(id); return w ? w.instance : null; };

// read what a handler answered, without changing it
function watchBody(res, cb) {
    const chunks = [], w = res.write.bind(res), e = res.end.bind(res);
    res.write = (c, ...a) => { if (c) chunks.push(Buffer.from(c)); return w(c, ...a); };
    res.end = (c, ...a) => { if (c && typeof c !== "function") chunks.push(Buffer.from(c)); const r = e(c, ...a); try { cb(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { /* not json */ } return r; };
}
router.use("/matchmake", (req, res, next) => {
    const me = who(req);
    if (me && req.method === "POST") watchBody(res, (b) => {
        if (/\/matchmake\/none\/?$/.test(req.originalUrl)) return setWhere(me.id, null);
        const inst = b && (b.roomInstance || b.RoomInstance);
        if (inst && inst.roomInstanceId && (b.errorCode === 0 || b.ErrorCode === 0)) setWhere(me.id, inst);
    });
    next();
});
router.use(["/player/logout", "/player/notifydisconnect"], (req, res, next) => { const me = who(req); if (me) setWhere(me.id, null); next(); });

// ---------- websocket push ----------
const conns = new Map();      // connectionId -> { socket, account }
const negotiated = new Map(); // connectionId -> accountId (from the negotiate call)
function wsText(str) { // one unmasked text frame (permessage-deflate allows uncompressed messages)
    const p = Buffer.from(str, "utf8"), n = p.length;
    const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : (() => { const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
    return Buffer.concat([head, p]);
}
const origEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function (ev, req, socket) {
    if (ev === "upgrade" && req && socket) {
        try {
            const u = new URL(req.url, "http://x");
            if (u.pathname === "/hub/v1") {
                const cid = u.searchParams.get("id");
                const h = String(req.headers.authorization || "");
                const account = tokenId(u.searchParams.get("access_token")) || (/^Bearer /i.test(h) ? tokenId(h.slice(7).trim()) : null) || negotiated.get(cid) || null;
                conns.set(cid, { socket, account });
                console.log(`[LIVE] notification socket ${String(cid).slice(0, 8)} -> ${account ? "account " + account : "unknown account (invites cannot reach this one)"}`);
                socket.once("close", () => conns.delete(cid));
            }
        } catch { /* not a hub upgrade */ }
    }
    return origEmit.apply(this, arguments);
};
router.post("/hub/v1/negotiate", (req, res, next) => {
    const me = who(req) || (req.query.access_token && { id: tokenId(req.query.access_token) });
    if (me && me.id) watchBody(res, (b) => { if (b && b.connectionId) negotiated.set(b.connectionId, me.id); if (negotiated.size > 5000) negotiated.delete(negotiated.keys().next().value); });
    next();
});
function push(account, type, msg) {
    let n = 0;
    const frame = wsText(JSON.stringify({ type: 1, target: "Notification", arguments: [JSON.stringify({ Id: String(type), Msg: msg })] }) + "\u001e");
    for (const c of conns.values()) if (c.account === account && c.socket && c.socket.writable) { try { c.socket.write(frame); n++; } catch { /* closed */ } }
    return n;
}

// ---------- invites ----------
const buildOf = (claims) => { const v = String(claims["rn.ver"] || claims.ver || process.env.GAME_VERSION || "20231207"); return parseInt(v.slice(0, 8), 10) || 0; };
router.post("/invite", form, json, (req, res) => {
    const me = who(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const to = parseInt(String(b.playerId ?? ""), 10), iid = parseInt(String(b.roomInstanceId ?? ""), 10) || 0;
    if (!to) return res.status(400).end();
    const inst = instances.get(iid) || instanceOf(me.id);
    const id = nextInvite++; invites.set(id, { from: me.id, to, instance: inst }); if (invites.size > 500) invites.delete(invites.keys().next().value);
    const v2 = (buildOf(me.claims) || V2_MIN_BUILD) >= V2_MIN_BUILD;
    const message = { Id: Date.now(), FromPlayerId: me.id, ToPlayerId: to, Type: v2 ? GAME_INVITE_V2 : GAME_INVITE,
        Data: v2 ? JSON.stringify({ InviteId: id, Name: "^" + String(inst ? inst.name : "Room").replace(/\s+/g, ""), InviteMode: PLAY_TOGETHER }) : String(iid || (inst && inst.roomInstanceId) || ""),
        SentTime: new Date().toISOString(), RoomId: inst ? inst.roomId : null };
    const sent = push(to, MESSAGE_RECEIVED, message);
    console.log(`[LIVE] invite #${id} ${me.id} -> ${to} to "${inst ? inst.name : "?"}" (${sent ? "delivered live" : "player not connected"})`);
    res.status(200).json({ RoomInviteId: id, FromPlayerId: me.id, ToPlayerId: to, RoomId: inst ? inst.roomId : null });
});

// ---------- joining: friend / invite / instance ----------
function join(req, res, inst) {
    const me = who(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    if (!inst) return res.status(200).json({ errorCode: 20, roomInstance: null });
    setWhere(me.id, inst);
    res.status(200).json({ errorCode: 0, roomInstance: inst });
}
router.post(/^\/matchmake\/player\/(\d+)$/, form, json, (req, res) => join(req, res, instanceOf(Number(req.params[0]))));
router.post(/^\/matchmake\/invite\/(\d+)$/, form, json, (req, res) => { const i = invites.get(Number(req.params[0])); join(req, res, i && i.to === (who(req) || {}).id ? i.instance : null); });
router.post(/^\/matchmake\/instance\/(\d+)$/, form, json, (req, res) => join(req, res, instances.get(Number(req.params[0])) || null));

module.exports = { router, where: instanceOf, push };