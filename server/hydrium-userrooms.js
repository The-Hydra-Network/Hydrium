// hydrium-userrooms.js - player rooms for Hydrium: create / clone rooms, a personal dorm per player, and the
// room-settings calls, all stored in data/user-rooms.json. They plug into hydrium-rooms.js (apply-userrooms.js),
// so room details, matchmaking AND room saving (hydrium-roomsave.js) work for them like for the Rec Room rooms.
//   GET  /rooms/base                  the template rooms (tag "base") the room-creation menu lists
//   POST /rooms/:id/clone  {name}     make a room from a template or from any cloneable room  -> {success,error,value}
//   POST /rooms/create     {name}     empty Maker Room
//   GET  /dormroom/me  (PUT)          the player's own dorm id (created on first use)
//   POST /matchmake/dorm              (match.js answers; this rewrites the reply to the player's own dorm room)
//   /rooms/1/subrooms/...             saves addressed to the old shared dorm id 1 go to the player's own dorm
//   GET  /rooms/createdby/me, ownedby/me, contributedby/me, ownedby/:id, /roomserver/rooms/createdby/me
//   PUT  /rooms/:id/{name,description,accessibility,tags,image,cloning,warning}   (room owner)
//   DELETE /rooms/:id                 (owner; not dorms)
// Mount BEFORE hydrium-rooms / hydrium-dorm / api / compat:  app.use(require("./hydrium-userrooms").router);
// Env: MAX_ROOMS_PER_ACCOUNT (default 10, 0 = unlimited)
const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const pb = require("./pb");

const router = express.Router();
const FILE = path.join(__dirname, "data", "user-rooms.json");
const FIRST_ROOM = 100000, FIRST_SUB = 100000;
const MAX_ROOMS = process.env.MAX_ROOMS_PER_ACCOUNT === undefined ? 10 : Number(process.env.MAX_ROOMS_PER_ACCOUNT);
const DORM_SCENE = "76d98498-60a1-430c-ab76-b54a29b7a163";
const MAKER_SCENE = "a75f7547-79eb-47c6-8986-6767abcb4f92";
const CREATOR = 255, COOWNER = 30;
const P = [express.urlencoded({ extended: true, limit: "100kb" }), express.json({ limit: "100kb" })];

// ---------- storage ----------
let S = { nextRoom: FIRST_ROOM, nextSub: FIRST_SUB, rooms: {}, dorms: {}, picked: {} };
try { S = { ...S, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch (_) {}
const persist = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(S)); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const rooms = () => Object.values(S.rooms);

// ---------- helpers ----------
function who(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try { const n = Number(jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET, { algorithms: ["HS256"] }).sub); return Number.isSafeInteger(n) && n > 0 ? n : null; } catch { return null; }
}
async function username(id) {
    try { const r = await pb.collection(pb.hydriumCollections.accounts).getFirstListItem(pb.filter("accountId = {:n}", { n: id })); return r.username || `Player${id}`; } catch { return `Player${id}`; }
}
const jr = () => require("./hydrium-rooms");
const saves = () => require("./room-saves");
const env = (ok, value, error = "") => ({ success: ok, error: ok ? "" : error, value: ok ? value : null });
const roleOf = (room, id) => Math.max(0, ...(room.Roles || []).filter((r) => Number(r.AccountId) === id).map((r) => Number(r.Role) || 0));
const view = (id) => { const r = jr().allRooms().get(id); return r || null; }; // with saves applied
const NAME_RE = /^[A-Za-z0-9_]+$/;
function nameProblem(name, exceptId) {
    if (!name) return "You must enter a name for your room.";
    if (name.length > 32) return "Your room name can be at most 32 characters.";
    if (!NAME_RE.test(name)) return "Your room name can only contain letters, numbers and underscores.";
    const k = name.toLowerCase();
    const taken = [...jr().allRooms().values()].some((r) => !r.IsDorm && r.RoomId !== exceptId && String(r.Name).toLowerCase() === k);
    return taken ? "A room with that name already exists!" : null;
}
const countOwned = (id) => rooms().filter((r) => r.CreatorAccountId === id && !r.IsDorm).length;

function sceneOf(room, s) {
    return { RoomSceneId: s.SubRoomId, RoomId: room.RoomId, RoomSceneLocationId: s.UnitySceneId, Name: s.Name, IsSandbox: !!s.IsSandbox,
        DataBlobName: s.DataBlob || "", MaxPlayers: s.MaxPlayers, CanMatchmakeInto: true, ReplicationId: room._replication || room.Name,
        UseLevelBasedMatchmaking: false, UseAgeBasedMatchmaking: false, UseRecRoyaleMatchmaking: false, ReleaseStatus: 2, SupportsJoinInProgress: true };
}
function baseRoom(id, name, acct) {
    return { RoomId: id, IsDorm: false, MaxPlayerCalculationMode: 0, MaxPlayers: 4, CloningAllowed: false, DisableMicAutoMute: false,
        DisableRoomComments: false, EncryptVoiceChat: false, ToxmodEnabled: false, LoadScreenLocked: false, PersistenceVersion: 0,
        AutoLocalizeRoom: false, IsDeveloperOwned: false, Name: name, Description: "", ImageName: "", WarningMask: 0, CustomWarning: null,
        CreatorAccountId: acct, State: 0, PublishState: 0, Accessibility: 0, SupportsLevelVoting: false, IsRRO: false, IsRecRoomApproved: false,
        IsPlacePlay: false, IsJuniorCreated: false, ExcludeFromLists: false, ExcludeFromSearch: false,
        SupportsScreens: true, SupportsWalkVR: true, SupportsTeleportVR: true, SupportsVRLow: true, SupportsQuest2: true, SupportsMobile: true,
        SupportsJuniors: true, MinLevel: 0, AgeRating: 0, CreatedAt: new Date().toISOString(), PublishedAt: null, BecameRRStudioRoomAt: null,
        Stats: { CheerCount: 0, FavoriteCount: 0, VisitorCount: 0, VisitCount: 0 }, RankedEntityId: String(id), RankingContext: null,
        UgcVersion: 1, UgcSubVersion: null, MinUgcSubVersion: null, ReleaseStatus: 2,
        SubRooms: [], Scenes: [], Roles: [{ AccountId: acct, Role: CREATOR, LastChangedByAccountId: null, InvitedRole: 0 }],
        DataBlob: null, Tags: [], PromoImages: [], PromoExternalContent: [], LoadScreens: [], PromoImageNames: [] };
}
const newSub = (roomId, src, acct) => ({ ...src, SubRoomId: S.nextSub++, RoomId: roomId, DataBlob: src.DataBlob || "", IsSandbox: true,
    MaxPlayers: src.MaxPlayers > 1 ? src.MaxPlayers : 4, Accessibility: 0, SavedByAccountId: acct, StagedSubRoomDataSaveId: null, CurrentSave: undefined });
// A clone starts with the contents of what it was cloned from: give each new sub room a real, published save of that
// blob (CurrentSave + what matchmaking loads). Without a save record the room opened empty.
function seed(room, sub, blobName, persistence, acct) {
    if (!blobName) return;
    try {
        const sv = saves().createSave({ roomId: room.RoomId, subRoomId: sub.SubRoomId, dataBlob: String(blobName), accountId: acct,
            persistenceVersion: Number.isFinite(Number(persistence)) ? Number(persistence) : undefined, autoPublish: true });
        saves().publish(room.RoomId, sub.SubRoomId, sv.SubRoomDataSaveId);
    } catch (e) { console.log(`[USERROOMS] could not seed ${blobName} into room ${room.RoomId}: ${e.message} (it still loads via the room's DataBlob)`); }
}
function add(room) { room.Scenes = room.SubRooms.map((s) => sceneOf(room, s)); S.rooms[room.RoomId] = room; persist(); return room; }

function createFromScene(name, acct, scene, replication) {
    const room = baseRoom(S.nextRoom++, name, acct);
    room._replication = replication;
    room.SubRooms = [newSub(room.RoomId, { Name: "Home", UnitySceneId: scene }, acct)];
    return add(room);
}
function cloneFrom(src, name, acct) {
    const room = { ...baseRoom(S.nextRoom++, name, acct), UgcVersion: src.UgcVersion || 1, PersistenceVersion: 0 };
    room.IsDorm = src.IsDorm === true;
    room._replication = (src.Scenes && src.Scenes[0] && src.Scenes[0].ReplicationId) || src._replication || src.ReplicationId || src.Name;
    room.Tags = (src.Tags || []).filter((t) => t && t.Type === 1 && !/^(base|rro)$/i.test(String(t.Tag))).map((t) => ({ Tag: t.Tag, Type: 1 })); // keep system tags, but a copy is not a template
    room.SubRooms = (src.SubRooms || []).map((s) => newSub(room.RoomId, s, acct));
    add(room);
    (src.SubRooms || []).forEach((s, i) => seed(room, room.SubRooms[i], (s.CurrentSave && s.CurrentSave.DataBlob) || s.DataBlob, (s.CurrentSave && s.CurrentSave.PersistenceVersion) ?? src.PersistenceVersion, acct));
    return room;
}
// the player's own dorm (created on first use)
async function dormOf(acct) {
    const picked = S.picked[acct] && S.rooms[S.picked[acct]];
    if (picked && picked.IsDorm && roleOf(picked, acct) >= COOWNER) return picked;
    let r = S.dorms[acct] && S.rooms[S.dorms[acct]];
    if (r) return r;
    const room = baseRoom(S.nextRoom++, `@${await username(acct)}'s Dorm`, acct);
    Object.assign(room, { IsDorm: true, Description: "A private room.", PersistenceVersion: 88, IsAGRoom: true, _replication: "DormRoom" });
    room.SubRooms = [newSub(room.RoomId, { Name: "dormroom2", UnitySceneId: DORM_SCENE, MaxPlayers: 4 }, acct)];
    add(room); S.dorms[acct] = room.RoomId; persist();
    console.log(`[USERROOMS] dorm ${room.RoomId} created for account ${acct}`);
    return room;
}

// called from hydrium-rooms.allRooms(): our records, saves applied
function records(applySaves) {
    return rooms().map((r) => {
        const rec = clone(r); delete rec._replication;
        rec.Scenes = (r.SubRooms || []).map((s) => sceneOf(r, s));
        for (const s of rec.SubRooms) { if (s.CurrentSave === undefined) delete s.CurrentSave; }
        // no load screen set yet: show the room's own picture while it loads (the game only has art of its own for RecCenter etc.)
        if ((!rec.LoadScreens || !rec.LoadScreens.length) && rec.ImageName) rec.LoadScreens = [{ ImageName: rec.ImageName, Title: rec.Name || "", Subtitle: "" }];
        return typeof applySaves === "function" ? applySaves(rec) : rec;
    });
}

// ---------- extra template ("base") rooms the room-creation menu offers, from data/base-rooms.json ----------
//   [{ "name": "OpenWorld", "scene": "<unity scene guid>", "replication": "OpenWorld", "maxPlayers": 20, "description": "..." }]
// Add them with:  node add-baseroom.js <name> <scene guid>   (no restart needed)
const BASE_FILE = path.join(__dirname, "data", "base-rooms.json");
let baseStamp = -1;
function syncBase() {
    let st; try { st = fs.statSync(BASE_FILE).mtimeMs; } catch { return; }
    if (st === baseStamp) return; baseStamp = st;
    let list; try { list = JSON.parse(fs.readFileSync(BASE_FILE, "utf8")); } catch (e) { console.log("[USERROOMS] base-rooms.json is not valid JSON: " + e.message); return; }
    if (!Array.isArray(list)) return;
    let changed = false; const keep = new Set();
    for (const b of list) {
        const name = String(b && b.name || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 32), scene = String(b && b.scene || "").trim().toLowerCase();
        if (!name || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(scene)) { console.log(`[USERROOMS] base-rooms.json: skipped "${b && b.name}" (needs a name and a scene guid)`); continue; }
        const key = name.toLowerCase(); keep.add(key);
        let r = rooms().find((x) => x._base === key);
        if (!r) { r = baseRoom(S.nextRoom++, name, 1); r._base = key; S.rooms[r.RoomId] = r; changed = true; console.log(`[USERROOMS] new template room "${name}" (room ${r.RoomId}, scene ${scene})`); }
        const mp = Math.max(1, Math.min(60, Number(b.maxPlayers) || 20));
        Object.assign(r, { Name: name, Description: String(b.description || "").slice(0, 500), CloningAllowed: true, Accessibility: 1, PublishState: 1, State: 0, MaxPlayers: mp, IsRRO: false,
            Tags: [{ Tag: "base", Type: 1 }], _replication: String(b.replication || name) });
        if (!r.SubRooms[0]) r.SubRooms = [newSub(r.RoomId, { Name: "Home", UnitySceneId: scene }, 1)];
        Object.assign(r.SubRooms[0], { Name: "Home", UnitySceneId: scene, MaxPlayers: mp, DataBlob: b.blob || "" });
        r.Scenes = r.SubRooms.map((x) => sceneOf(r, x)); changed = true;
    }
    for (const r of rooms()) if (r._base && !keep.has(r._base)) { delete S.rooms[r.RoomId]; changed = true; console.log(`[USERROOMS] template room "${r.Name}" removed`); }
    if (changed) persist();
}
{ let fx = 0; for (const r of rooms()) if (!r._base && (r.Tags || []).some((t) => /^(base|rro)$/i.test(String(t.Tag)))) { r.Tags = r.Tags.filter((t) => !/^(base|rro)$/i.test(String(t.Tag))); fx++; } if (fx) { persist(); console.log(`[USERROOMS] ${fx} player room(s) were listed as templates: fixed`); } }
syncBase();
router.use((req, res, next) => { if (req.method === "GET" || req.method === "POST") syncBase(); next(); });

// ---------- routes ----------
router.get("/rooms/base", (req, res) => {
    const skip = Math.max(0, Number(req.query.skip) || 0), take = Number(req.query.take) > 0 ? Number(req.query.take) : 100;
    const list = [...jr().allRooms().values()].filter((r) => (r.Tags || []).some((t) => String(t.Tag).toLowerCase() === "base"));
    console.log(`[USERROOMS] rooms/base -> ${list.length}`);
    res.json(list.slice(skip, skip + take));
});

async function doClone(req, res, srcId) {
    const acct = who(req);
    if (acct === null) return res.status(401).json(env(false, null, "Unauthorized"));
    const b = req.body || {}, name = String(b.name ?? b.Name ?? req.query.name ?? "").trim();
    const bad = nameProblem(name);
    if (bad) return res.json(env(false, null, bad));
    if (MAX_ROOMS > 0 && countOwned(acct) >= MAX_ROOMS) return res.json(env(false, null, `You can only have ${MAX_ROOMS} rooms.`));
    let room;
    if (srcId === null) room = createFromScene(name, acct, MAKER_SCENE, "MakerRoom");
    else {
        const src = view(srcId);
        if (!src || (src.CloningAllowed === false && roleOf(src, acct) < COOWNER)) return res.json(env(false, null, "You can't clone this room!"));
        room = cloneFrom(src, name, acct);
    }
    console.log(`[USERROOMS] account ${acct} made room ${room.RoomId} "${name}"${srcId === null ? "" : " from " + srcId}`);
    res.json(env(true, view(room.RoomId) || room));
}
router.post("/rooms/create", P, (req, res) => doClone(req, res, null));
router.post("/rooms/:roomId/clone", P, (req, res, next) => (/^\d+$/.test(req.params.roomId) ? doClone(req, res, Number(req.params.roomId)) : next()));

router.get("/dormroom/me", async (req, res) => {
    const acct = who(req); if (acct === null) return res.status(401).end();
    res.json((await dormOf(acct)).RoomId);
});
router.put("/dormroom/me", P, async (req, res) => {
    const acct = who(req); if (acct === null) return res.status(401).end();
    const id = Number(String((req.body && req.body.roomId) ?? req.query.roomId ?? ""));
    const r = S.rooms[id], fail = (s, e) => res.status(s).json({ Value: null, Success: false, Error: e, error_id: null });
    if (!Number.isSafeInteger(id)) return fail(400, "A numeric roomId is required");
    if (!r) return fail(404, "This room does not exist!");
    if (!r.IsDorm || roleOf(r, acct) < COOWNER) return fail(403, "That is not one of your dorms!");
    S.picked[acct] = id; persist();
    res.json({ Value: id, Success: true, Error: null, error_id: null });
});

// the game enters its dorm through match.js; point the reply at the player's own dorm room
router.post("/matchmake/dorm", (req, res, next) => {
    const acct = who(req);
    if (acct === null) return next();
    const orig = res.json.bind(res);
    res.json = (body) => {
        const inst = body && body.roomInstance;
        if (!inst || typeof inst !== "object") return orig(body);
        dormOf(acct).then((dorm) => {
            const v = view(dorm.RoomId) || dorm, sub = v.SubRooms[0];
            let blob = ""; try { blob = saves().currentBlob(dorm.RoomId, sub.SubRoomId) || ""; } catch (_) {}
            Object.assign(inst, { roomId: dorm.RoomId, subRoomId: sub.SubRoomId, roomSceneId: sub.SubRoomId, name: dorm.Name, isSandbox: true,
                ...(blob ? { dataBlob: blob, dataBlobName: blob } : {}) });
            try { const m = require("./match").activeRoomByLoginLock, k = req.body && (req.body.LoginLock ?? req.body.loginLock); if (m && k && m.get(String(k)) && m.get(String(k)) !== inst) Object.assign(m.get(String(k)), inst); } catch (_) {}
            console.log(`[USERROOMS] dorm instance -> room ${dorm.RoomId} sub ${sub.SubRoomId} for ${acct}`);
            orig(body);
        }).catch(() => orig(body));
        return res;
    };
    next();
});

// saves aimed at the old shared dorm (room 1) land in the player's own dorm
router.use(async (req, res, next) => {
    if (!/^\/rooms\/1\/subrooms(\/|$|\?)/.test(req.url)) return next();
    const acct = who(req);
    if (acct === null) return next();
    try {
        const d = await dormOf(acct), sub = d.SubRooms[0].SubRoomId, before = req.url;
        req.url = req.url.replace(/^\/rooms\/1\/subrooms(\/\d+)?/, (m, n) => `/rooms/${d.RoomId}/subrooms${n ? "/" + sub : ""}`);
        console.log(`[USERROOMS] ${req.method} ${before} -> ${req.url}`);
    } catch (_) {}
    next();
});

// ---------- sub rooms (owner / co-owner) ----------
const ACCESS = { private: 0, public: 1, unlisted: 2, "0": 0, "1": 1, "2": 2, "3": 3, "4": 4 };
const parseAccess = (v) => (v === undefined || v === null || v === "" ? undefined : ACCESS[String(v).trim().toLowerCase()]);
const SUB_NAME = /^[A-Za-z0-9_ ]{1,32}$/;
const subNameProblem = (room, name, exceptId) => !name ? "You must enter a name for your subroom!"
    : !SUB_NAME.test(name) ? "Subroom names can only contain letters, numbers, spaces and underscores (32 max)."
    : room.SubRooms.some((s) => s.SubRoomId !== exceptId && String(s.Name).toLowerCase() === name.toLowerCase()) ? "This room already has a subroom with that name!" : null;
function subGate(req, res, pascal) {
    const id = Number(req.params.roomId), room = S.rooms[id];
    const deny = (m, eid) => { res.json(pascal ? { Success: false, Value: null, ErrorId: eid || "Rooms.Error", Error: m } : env(false, null, m)); return null; };
    const acct = who(req); if (acct === null) { res.status(401).json(pascal ? { Success: false, Value: null, Error: "Unauthorized" } : env(false, null, "Unauthorized")); return null; }
    if (!room) return deny("This room does not exist!", "Rooms.DoesntExist");
    if (roleOf(room, acct) < COOWNER) return deny("You are not the owner of this room!");
    let sub = null;
    if (req.params.subRoomId !== undefined) { sub = room.SubRooms.find((s) => s.SubRoomId === Number(req.params.subRoomId)); if (!sub) return deny("This subroom does not exist!", "Rooms.DoesntExist"); }
    return { acct, room, sub };
}
const mineRoom = (req, res, next) => (/^\d+$/.test(req.params.roomId) && S.rooms[Number(req.params.roomId)] && (req.params.subRoomId === undefined || /^\d+$/.test(req.params.subRoomId))) ? next() : next("route");
const done = (res, room) => res.json(env(true, view(room.RoomId) || room));

router.post("/rooms/:roomId/subrooms", P, mineRoom, (req, res) => {
    const g = subGate(req, res); if (!g) return;
    const name = String((req.body && req.body.name) ?? "").trim(), bad = subNameProblem(g.room, name);
    if (bad) return res.json(env(false, null, bad));
    if (g.room.SubRooms.length >= 30) return res.json(env(false, null, "A room can have at most 30 subrooms."));
    const first = g.room.SubRooms[0];
    g.room.SubRooms.push(newSub(g.room.RoomId, { Name: name, UnitySceneId: first.UnitySceneId, MaxPlayers: first.MaxPlayers }, g.acct));
    g.room.Scenes = g.room.SubRooms.map((x) => sceneOf(g.room, x)); persist();
    console.log(`[USERROOMS] room ${g.room.RoomId}: subroom "${name}" created`);
    done(res, g.room);
});
router.delete("/rooms/:roomId/subrooms/:subRoomId", mineRoom, (req, res) => {
    const g = subGate(req, res); if (!g) return;
    if (g.room.SubRooms.length <= 1) return res.json(env(false, null, "You can't delete a room's only subroom!"));
    g.room.SubRooms = g.room.SubRooms.filter((s) => s.SubRoomId !== g.sub.SubRoomId);
    g.room.Scenes = g.room.SubRooms.map((x) => sceneOf(g.room, x)); persist();
    done(res, g.room);
});
router.put("/rooms/:roomId/subrooms/:subRoomId/modify", P, mineRoom, (req, res) => {
    const g = subGate(req, res, true); if (!g) return;
    const b = req.body || {}, name = String(b.name ?? "").trim(), bad = subNameProblem(g.room, name, g.sub.SubRoomId);
    if (bad) return res.json({ Success: false, Value: null, ErrorId: "Rooms.InvalidName", Error: bad });
    g.sub.Name = name;
    const acc = parseAccess(b.accessibility); if (acc !== undefined) g.sub.Accessibility = acc;
    const mp = Number.parseInt(b.maxPlayers, 10); if (mp > 0) g.sub.MaxPlayers = Math.min(mp, 100);
    g.room.Scenes = g.room.SubRooms.map((x) => sceneOf(g.room, x)); persist();
    res.json({ Success: true, Value: null, ErrorId: null, Error: null });
});
router.put("/rooms/:roomId/subrooms/:subRoomId/accessibility", P, mineRoom, (req, res) => {
    const g = subGate(req, res); if (!g) return;
    const acc = parseAccess(req.body && req.body.accessibility);
    if (acc === undefined) return res.json(env(false, null, "You must provide a valid accessibility!"));
    g.sub.Accessibility = acc; persist(); done(res, g.room);
});
router.post("/rooms/:roomId/subrooms/:subRoomId/clone", P, mineRoom, (req, res) => {
    const g = subGate(req, res); if (!g) return;
    const base = String(g.sub.Name).replace(/_?copy\d*$/i, "");
    let n = 1, name; do { name = `${base}_copy${n > 1 ? n : ""}`.slice(0, 32); n++; } while (g.room.SubRooms.some((s) => s.Name.toLowerCase() === name.toLowerCase()) && n < 50);
    const copy = newSub(g.room.RoomId, { ...g.sub, Name: name }, g.acct), cur = view(g.room.RoomId).SubRooms.find((s) => s.SubRoomId === g.sub.SubRoomId) || g.sub;
    g.room.SubRooms.push(copy); g.room.Scenes = g.room.SubRooms.map((x) => sceneOf(g.room, x)); persist();
    seed(g.room, copy, (cur.CurrentSave && cur.CurrentSave.DataBlob) || cur.DataBlob, cur.CurrentSave && cur.CurrentSave.PersistenceVersion, g.acct);
    done(res, g.room);
});

// ---------- lists ----------
const mine = (acct, pred) => [...jr().allRooms().values()].filter((r) => S.rooms[r.RoomId] && pred(r, acct));
const isCreator = (r, a) => r.CreatorAccountId === a;
router.get(["/rooms/createdby/me", "/roomserver/rooms/createdby/me"], (req, res) => { const a = who(req); if (a === null) return res.status(401).end(); res.json(mine(a, isCreator)); });
router.get("/rooms/ownedby/me", (req, res) => { const a = who(req); if (a === null) return res.status(401).end(); res.json(mine(a, (r) => isCreator(r, a) && !r.IsDorm)); });
router.get("/rooms/contributedby/me", (req, res) => { const a = who(req); if (a === null) return res.status(401).end(); res.json(mine(a, (r) => roleOf(r, a) >= COOWNER && !(r.IsDorm && isCreator(r, a) && false))); });
router.get("/rooms/ownedby/:accountId", (req, res, next) => {
    if (!/^\d+$/.test(req.params.accountId)) return next();
    const t = Number(req.params.accountId), me = who(req);
    res.json(mine(t, (r) => isCreator(r, t) && !r.IsDorm && (r.Accessibility === 1 || me === t)));
});

// ---------- owner settings ----------
function owned(req, res) {
    const acct = who(req); if (acct === null) { res.status(401).json(env(false, null, "Unauthorized")); return null; }
    const room = S.rooms[Number(req.params.roomId)];
    if (!room) { res.json(env(false, null, "This room does not exist!")); return null; }
    if (roleOf(room, acct) < COOWNER) { res.json(env(false, null, "You do not have permission to change this room.")); return null; }
    return { acct, room };
}
const settings = {
    description: (room, b) => { room.Description = String(b.description ?? "").slice(0, 500); },
    accessibility: (room, b) => { const n = Number(b.accessibility); if (![0, 1, 2].includes(n)) return "Invalid accessibility."; room.Accessibility = n; for (const s of room.SubRooms) s.Accessibility = n; if (n === 1 && !room.PublishedAt) room.PublishedAt = new Date().toISOString(); },
    image: (room, b) => { room.ImageName = String(b.imageName ?? ""); },
    loadscreen: (room, b) => { // the picture shown while the room loads; replaces the list (the game only shows one)
        const img = String(b.imageName ?? "").trim(); if (!img) return "You must provide an image!";
        room.LoadScreens = [{ ImageName: img.slice(0, 200), Title: String(b.title ?? "").slice(0, 100), Subtitle: String(b.subtitle ?? "").slice(0, 200) }];
    },
    cloning: (room, b) => { room.CloningAllowed = /^true$/i.test(String(b.cloningAllowed)); },
    warning: (room, b) => { room.WarningMask = Number(b.warningMask) || 0; room.CustomWarning = b.customWarning ? String(b.customWarning) : null; },
    name: (room, b) => { const n = String(b.name ?? "").trim(), bad = room.IsDorm ? (n ? null : "You must enter a name for your room.") : nameProblem(n, room.RoomId); if (bad) return bad; room.Name = n; },
    tags: (room, b) => {
        const arr = (v) => [].concat(v ?? []).map(String).filter(Boolean);
        const user = (room.Tags || []).filter((t) => t.Type !== 1).map((t) => t.Tag), keys = Object.keys(b);
        let next = user;
        if (keys.length === 1 && keys[0] === "tag" && arr(b.tag).length === 1) { const t = arr(b.tag)[0]; next = user.includes(t) ? user.filter((x) => x !== t) : [...user, t]; }
        else if (b.tag !== undefined) next = arr(b.tag);
        const prim = b.primaryGenreTag ? String(b.primaryGenreTag) : null;
        if (prim && !next.includes(prim)) next.push(prim);
        const auto = [...new Set([...(room.Tags || []).filter((t) => t.Type === 1).map((t) => t.Tag), ...arr(b.autoTag)])];
        const oldPrim = (room.Tags || []).find((t) => t.Type !== 1 && t.IsPrimary);
        room.Tags = [...next.map((t) => ({ Tag: t, Type: 0, ...((prim ? t === prim : oldPrim && oldPrim.Tag === t) ? { IsPrimary: true } : {}) })), ...auto.map((t) => ({ Tag: t, Type: 1 }))];
    },
};
for (const [key, fn] of Object.entries(settings)) {
    router.put(`/rooms/:roomId/${key}`, P, (req, res, next) => {
        if (!/^\d+$/.test(req.params.roomId) || !S.rooms[Number(req.params.roomId)]) return next();
        const o = owned(req, res); if (!o) return;
        const bad = fn(o.room, req.body || {});
        if (bad) return res.json(env(false, null, bad));
        persist();
        res.json(env(true, view(o.room.RoomId) || o.room));
    });
}
router.delete("/rooms/:roomId", (req, res, next) => {
    if (!/^\d+$/.test(req.params.roomId) || !S.rooms[Number(req.params.roomId)]) return next();
    const acct = who(req), room = S.rooms[Number(req.params.roomId)];
    if (acct === null) return res.status(401).end();
    if (room.CreatorAccountId !== acct || room.IsDorm) return res.json(env(false, null, "You can't delete this room."));
    delete S.rooms[room.RoomId]; persist();
    console.log(`[USERROOMS] account ${acct} deleted room ${room.RoomId}`);
    res.json(env(true, null));
});

console.log(`[USERROOMS] ${rooms().length} player rooms loaded (${Object.keys(S.dorms).length} dorms)`);
// ---------- used by the admin panel's zip import ----------
// spec: { name, description, tags[], imageName, loadScreens[{ImageName,Title,Subtitle}], maxPlayers, cloningAllowed, accessibility, warningMask,
//         customWarning, scene (fallback scene guid), subs:[{ name, scene, maxPlayers, blob }] }.  Makes a new room owned by `acct`.
function importRoom(spec, acct) {
    acct = Number(acct); if (!Number.isSafeInteger(acct) || acct < 1) throw new Error("bad owner");
    let name = String(spec.name || "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "Imported";
    const base = name; for (let n = 2; nameProblem(name); n++) { name = base.slice(0, 32 - String(n).length - 1) + "_" + n; if (n > 500) throw new Error("no free room name"); }
    const fallback = /^[0-9a-f-]{36}$/i.test(String(spec.scene || "")) ? String(spec.scene).toLowerCase() : DORM_SCENE;
    const room = baseRoom(S.nextRoom++, name, acct);
    room._replication = name;
    room.Description = String(spec.description || "").slice(0, 500);
    room.ImageName = String(spec.imageName || "").slice(0, 200);
    room.MaxPlayers = Math.max(1, Math.min(60, Number(spec.maxPlayers) || 4));
    room.CloningAllowed = spec.cloningAllowed === true;
    room.WarningMask = Number(spec.warningMask) || 0; room.CustomWarning = spec.customWarning ? String(spec.customWarning).slice(0, 200) : null;
    const acc = [0, 1, 2].includes(Number(spec.accessibility)) ? Number(spec.accessibility) : 0;
    room.Accessibility = acc;
    room.Tags = (spec.tags || []).map(String).filter((t) => /^[A-Za-z0-9_]{1,32}$/.test(t)).slice(0, 12).map((t) => ({ Tag: t, Type: 0 }));
    room.LoadScreens = (spec.loadScreens || []).filter((l) => l && l.ImageName).slice(0, 1).map((l) => ({ ImageName: String(l.ImageName).slice(0, 200), Title: String(l.Title || "").slice(0, 100), Subtitle: String(l.Subtitle || "").slice(0, 200) }));
    const used = new Set(), subs = (spec.subs && spec.subs.length ? spec.subs : [{ name: "Home" }]).slice(0, 30);
    room.SubRooms = subs.map((x, i) => {
        let n = String(x.name || "").replace(/[^A-Za-z0-9_ ]+/g, "_").trim().slice(0, 32) || (i === 0 ? "Home" : "Sub" + (i + 1)), k = 2; const b = n;
        while (used.has(n.toLowerCase())) n = b.slice(0, 30) + "_" + k++;
        used.add(n.toLowerCase());
        const sc = /^[0-9a-f-]{36}$/i.test(String(x.scene || "")) ? String(x.scene).toLowerCase() : fallback;
        const sub = newSub(room.RoomId, { Name: n, UnitySceneId: sc, MaxPlayers: Number(x.maxPlayers) || room.MaxPlayers }, acct);
        sub.Accessibility = acc; return sub;
    });
    add(room);
    room.SubRooms.forEach((sub, i) => seed(room, sub, subs[i].blob, undefined, acct));
    console.log(`[USERROOMS] imported room ${room.RoomId} "${room.Name}" for account ${acct} (${room.SubRooms.length} sub-room(s))`);
    return { roomId: room.RoomId, name: room.Name, subs: room.SubRooms.map((x, i) => ({ id: x.SubRoomId, name: x.Name, blob: subs[i].blob || "" })) };
}

module.exports = { router, records, importRoom };