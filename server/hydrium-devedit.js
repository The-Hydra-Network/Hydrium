// hydrium-devedit.js - accounts with the developer role can edit EVERY room.
// For a developer token only (everyone else is untouched) it:
//   * adds the developer to the room's Roles as co-owner (30) in every room response
//     (RecCenter, RRO rooms, Orientation, other people's rooms ...). CreatorAccountId is NOT changed.
//   * turns IsSandbox on for the room's sub rooms/scenes, and on the matchmake instance,
//     so the Maker Pen is allowed there.
//   * lets them save room changes (via apply-devedit.js, which patches hydrium-roomsave.js).
// Mount BEFORE hydrium-rooms/api/rooms (they answer first otherwise):
//   app.use(require("./hydrium-devedit").router);
// Env: DEVEDIT_SANDBOX=0 keeps the sandbox flags as they are (roles only).
//      DEVEDIT_ROLE=255 grants creator instead of co-owner.
//      DEVEDIT_UNLOCK=0 keeps Rec Room's own flags. By default developers see every room as an ordinary
//        player-made room (IsRRO / IsDeveloperOwned off, "rro" tag removed), because the game may treat
//        Rec Room-owned rooms' walls and preplaced props as locked.
// Limit: things baked into a room's Unity scene (the RecCenter building itself) cannot be edited,
//        only what the Maker Pen placed on top of it.
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const SANDBOX = process.env.DEVEDIT_SANDBOX !== "0";
const ROLE = Number(process.env.DEVEDIT_ROLE) || 30;
const UNLOCK = process.env.DEVEDIT_UNLOCK !== "0";

function tokenOf(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try { return jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET, { algorithms: ["HS256"] }); } catch { return null; }
}
function devId(req) {
    const d = tokenOf(req);
    if (!d) return null;
    const roles = [].concat(d.role || []).flatMap((r) => String(r).toLowerCase().split(/[,\s]+/));
    if (!roles.includes("developer") && !roles.includes("admin")) return null;
    const id = Number(d.sub);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}
const isDevReq = (req) => devId(req) !== null;

function grant(room, id) {
    const out = { ...room };
    const roles = Array.isArray(room.Roles) ? room.Roles.map((r) => ({ ...r })) : [];
    const mine = roles.find((r) => Number(r.AccountId) === id);
    if (mine) mine.Role = Math.max(Number(mine.Role) || 0, ROLE);
    else roles.push({ AccountId: id, Role: ROLE, LastChangedByAccountId: null, InvitedRole: 0 });
    out.Roles = roles;
    if (Array.isArray(room.CoOwners) && !room.CoOwners.includes(id)) out.CoOwners = [...room.CoOwners, id];
    if (UNLOCK) {
        out.IsRRO = false;
        out.IsDeveloperOwned = false;
        if (Array.isArray(room.Tags)) out.Tags = room.Tags.filter((t) => String((t && t.Tag) || t).toLowerCase() !== "rro");
    }
    if (SANDBOX) {
        if (Array.isArray(room.SubRooms)) out.SubRooms = room.SubRooms.map((s) => ({ ...s, IsSandbox: true }));
        if (Array.isArray(room.Scenes)) out.Scenes = room.Scenes.map((s) => ({ ...s, IsSandbox: true }));
    }
    return out;
}
const isRoom = (x) => x && typeof x === "object" && !Array.isArray(x) && x.RoomId !== undefined && (Array.isArray(x.SubRooms) || Array.isArray(x.Roles));
function walk(body, id) {
    if (Array.isArray(body)) return body.map((x) => walk(x, id));
    if (isRoom(body)) return grant(body, id);
    if (body && typeof body === "object") for (const k of ["Results", "results", "Rooms", "rooms", "Entities"]) if (Array.isArray(body[k])) return { ...body, [k]: body[k].map((x) => walk(x, id)) };
    return body;
}

router.use("/rooms", (req, res, next) => {
    const id = devId(req);
    if (!id) return next();
    const orig = res.json.bind(res);
    res.json = (body) => { try { body = walk(body, id); } catch (e) { console.log("[DEVEDIT] " + e.message); } return orig(body); };
    next();
});

router.use("/matchmake", (req, res, next) => {
    const id = devId(req);
    if (!id || !SANDBOX) return next();
    const orig = res.json.bind(res);
    res.json = (body) => {
        if (body && body.roomInstance && typeof body.roomInstance === "object" && !body.roomInstance.isSandbox) {
            body = { ...body, roomInstance: { ...body.roomInstance, isSandbox: true } };
            console.log(`[DEVEDIT] sandbox enabled for developer ${id} in ${body.roomInstance.name || "room"}`);
        }
        return orig(body);
    };
    next();
});

console.log(`[DEVEDIT] developers can edit every room (role ${ROLE}, sandbox ${SANDBOX ? "on" : "off"}, unlock ${UNLOCK ? "on" : "off"})`);
module.exports = { router, isDevReq, devId };
