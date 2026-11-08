// Hydrium Rec - RecCenter + tutte le Rec Room Originals (RRO) su Hydrium.
// RecCenter (RoomId 2) e' speciale (dati importati + ruoli); le altre RRO vengono
// da roomdata\rro-rooms.json. Matchmaking pubblico condiviso per ognuna.
// Montato in index.js PRIMA di app.use(auth). Per tutto cio' che non e' RecCenter
// fa next(), quindi il resto di Hydrium non cambia.
const express = require("express");
const fs = require("fs");
const path = require("path");
const saves = require("./room-saves");
const router = express.Router();

const REC_ID = 2;
const SUB_ID = 2;
const SCENE = "cbad71af-0831-44d8-b8ef-69edafa841f6";
const MAX_PLAYERS = 12;
const REGION = process.env.PHOTON_REGION || "eu";

// ---- stanza importata da RecFlare (cartella roomdata\) ----
// roomdata\reccenter.json (da export-reccenter.js) + roomdata\room\<file dati>.
// Se non c'e', il RecCenter resta quello vuoto di base.
const DATA_DIR = path.join(__dirname, "roomdata");
let _imp = { mtime: -1, value: null };
function imported() {
    try {
        const f = path.join(DATA_DIR, "reccenter.json");
        const m = fs.statSync(f).mtimeMs;
        if (m !== _imp.mtime) {
            const j = JSON.parse(fs.readFileSync(f, "utf8"));
            const first = (j.subrooms || []).find(x => x.currentSave && x.currentSave.DataBlob) || null;
            _imp = { mtime: m, value: first ? { room: j.room || {}, sub: first.subRoom || {}, save: first.currentSave } : null };
            console.log(_imp.value ? `[hydrium-ROOMS] RecCenter importato caricato (dati: ${_imp.value.save.DataBlob})` : "[hydrium-ROOMS] reccenter.json trovato ma senza salvataggio");
        }
    } catch (_) { _imp = { mtime: -1, value: null }; }
    return _imp.value;
}
function currentBlob() { const i = imported(); return i ? i.save.DataBlob : ""; }

// ---- salvataggi fatti dal gioco (room-saves.js) ----
// Sovrappone l'ultimo salvataggio al record stanza: CurrentSave / DataBlob /
// StagedSubRoomDataSaveId di ogni sottostanza e DataBlobName della scena.
function applySaves(rec) {
    for (const sub of rec.SubRooms || []) {
        const st = saves.state(rec.RoomId, sub.SubRoomId);
        if (st.staged) sub.StagedSubRoomDataSaveId = st.staged.SubRoomDataSaveId;
        else if (st.current) sub.StagedSubRoomDataSaveId = null;
        if (!st.current) continue;
        sub.DataBlob = st.current.DataBlob;
        sub.CurrentSave = st.current;
        if (typeof st.current.SavedByAccountId === "number") sub.SavedByAccountId = st.current.SavedByAccountId;
        const scene = (rec.Scenes || []).find(s => s.RoomSceneId === sub.SubRoomId);
        if (scene) scene.DataBlobName = st.current.DataBlob;
        if (typeof st.current.PersistenceVersion === "number") rec.PersistenceVersion = st.current.PersistenceVersion;
    }
    return rec;
}

// ---- record stanza (formato Orientation/Dorm di Hydrium + dati RecFlare) ----
function roomRecord() {
    const r = baseRoomRecord();
    const imp = imported();
    if (!imp) return applySaves(r);
    const save = Object.assign({}, imp.save, { SubRoomId: SUB_ID });
    const sub = r.SubRooms[0];
    sub.DataBlob = save.DataBlob;
    sub.CurrentSave = save;
    sub.StagedSubRoomDataSaveId = null;
    if (typeof save.SavedByAccountId === "number") sub.SavedByAccountId = save.SavedByAccountId;
    r.Scenes[0].DataBlobName = save.DataBlob;
    r.PersistenceVersion = typeof save.PersistenceVersion === "number" ? save.PersistenceVersion : 0;
    if (typeof imp.room.UgcVersion === "number") r.UgcVersion = imp.room.UgcVersion;
    return applySaves(r);
}

// ---- who can edit RecCenter (Maker Pen) ----
// reccenter-roles.json next to index.js, re-read when it changes (no restart needed):
//   { "creator": 1, "coOwners": [2, 3], "hosts": [] }
// creator = owner (role 255), coOwners = role 30, hosts = role 10.
const ROLES_FILE = path.join(__dirname, "reccenter-roles.json");
let _roles = { mtime: -1, value: null };
function roleConfig() {
    try {
        const m = fs.statSync(ROLES_FILE).mtimeMs;
        if (m !== _roles.mtime) {
            const j = JSON.parse(fs.readFileSync(ROLES_FILE, "utf8"));
            const ids = (v) => [].concat(v ?? []).map(Number).filter(Number.isSafeInteger);
            _roles = { mtime: m, value: { creator: Number.isSafeInteger(Number(j.creator)) ? Number(j.creator) : 1, coOwners: ids(j.coOwners), hosts: ids(j.hosts) } };
            console.log(`[hydrium-ROOMS] RecCenter roles loaded: creator=${_roles.value.creator} coOwners=[${_roles.value.coOwners}] hosts=[${_roles.value.hosts}]`);
        }
    } catch (_) { _roles = { mtime: -1, value: null }; }
    return _roles.value || { creator: 1, coOwners: [], hosts: [] };
}
function roleList() {
    const c = roleConfig();
    const seen = new Set([c.creator]);
    const out = [{ AccountId: c.creator, Role: 255, LastChangedByAccountId: null, InvitedRole: 0 }];
    for (const [ids, role] of [[c.coOwners, 30], [c.hosts, 10]])
        for (const id of ids) if (!seen.has(id)) { seen.add(id); out.push({ AccountId: id, Role: role, LastChangedByAccountId: null, InvitedRole: 0 }); }
    return out;
}

function baseRoomRecord() {
    return {
        RoomId: REC_ID, IsDorm: false, MaxPlayerCalculationMode: 0, MaxPlayers: MAX_PLAYERS,
        CloningAllowed: false, DisableMicAutoMute: false, DisableRoomComments: false,
        EncryptVoiceChat: false, ToxmodEnabled: true, LoadScreenLocked: false,
        PersistenceVersion: 0, AutoLocalizeRoom: false, IsDeveloperOwned: true,
        Name: "RecCenter",
        Description: "A social hub to meet and mingle with friends new and old.",
        ImageName: "RecCenter.jpg", WarningMask: 0, CustomWarning: null,
        CreatorAccountId: roleConfig().creator, State: 0, Accessibility: 1, SupportsLevelVoting: false,
        IsRRO: true, IsRecRoomApproved: false, SupportsScreens: true, SupportsWalkVR: true,
        SupportsTeleportVR: true, SupportsVRLow: true, SupportsQuest2: true,
        SupportsMobile: true, SupportsJuniors: true, MinLevel: 0, AgeRating: 2,
        CreatedAt: "2023-01-01T00:00:00Z",
        Stats: { CheerCount: 0, FavoriteCount: 0, VisitorCount: 0, VisitCount: 0 },
        RankedEntityId: String(REC_ID), RankingContext: null,
        SubRooms: [{
            SubRoomId: SUB_ID, RoomId: REC_ID, Name: "Home", DataBlob: null,
            IsSandbox: false, MaxPlayers: MAX_PLAYERS, Accessibility: 1,
            UnitySceneId: SCENE, SavedByAccountId: 0
        }],
        Scenes: [{
            RoomSceneId: SUB_ID, RoomId: REC_ID, RoomSceneLocationId: SCENE, Name: "Home",
            IsSandbox: false, DataBlobName: "", MaxPlayers: MAX_PLAYERS,
            CanMatchmakeInto: true, ReplicationId: "RecCenter",
            UseLevelBasedMatchmaking: false, UseAgeBasedMatchmaking: false,
            UseRecRoyaleMatchmaking: false, ReleaseStatus: 2, SupportsJoinInProgress: true
        }],
        Roles: roleList(), DataBlob: null, UgcVersion: 1,
        Tags: [{ Tag: "rro", Type: 0 }],
        PromoImages: [], PromoExternalContent: [], LoadScreens: []
    };
}

// ---- altre RRO: roomdata\rro-rooms.json (copiato da RecFlare: ImportRooms.json) ----
// Le scene Unity sono dentro il client, quindi non servono file dati: basta il record.
const RRO_FILE = path.join(DATA_DIR, "rro-rooms.json");
let _rro = { mtime: -1, value: new Map() };
function otherRooms() {
    try {
        const m = fs.statSync(RRO_FILE).mtimeMs;
        if (m !== _rro.mtime) {
            const list = JSON.parse(fs.readFileSync(RRO_FILE, "utf8"));
            const map = new Map();
            for (const r of list) {
                // 1 = dorm e 13 = Orientation li gestisce Hydrium; 2 = RecCenter e' qui sopra
                if (!r || !Number.isSafeInteger(r.RoomId) || [1, 2, 13].includes(r.RoomId)) continue;
                map.set(r.RoomId, r);
            }
            _rro = { mtime: m, value: map };
            console.log(`[hydrium-ROOMS] ${map.size} stanze RRO caricate da rro-rooms.json`);
        }
    } catch (_) { _rro = { mtime: -1, value: new Map() }; }
    return _rro.value;
}
function buildOther(r) {
    const rec = JSON.parse(JSON.stringify(r));
    rec.CreatorAccountId = roleConfig().creator;
    rec.Roles = roleList();
    rec.ReplicationId = rec.Name;
    rec.ReleaseStatus = 2;
    rec.Scenes = rec.SubRooms.map(s => ({
        RoomSceneId: s.SubRoomId, RoomId: rec.RoomId, RoomSceneLocationId: s.UnitySceneId,
        Name: s.Name, IsSandbox: !!s.IsSandbox, DataBlobName: "", MaxPlayers: s.MaxPlayers,
        CanMatchmakeInto: true, ReplicationId: rec.Name,
        UseLevelBasedMatchmaking: false, UseAgeBasedMatchmaking: false,
        UseRecRoyaleMatchmaking: false, ReleaseStatus: 2, SupportsJoinInProgress: true
    }));
    for (const s of rec.SubRooms) { s.DataBlob = s.DataBlob || ""; }
    rec.DataBlob = null;
    return applySaves(rec);
}
// tutte le stanze gestite qui: id -> record
function allRooms() {
    const out = new Map([[REC_ID, roomRecord()]]);
    for (const [id, r] of otherRooms()) out.set(id, buildOther(r));
    try { for (const r of require("./hydrium-userrooms").records(applySaves)) out.set(r.RoomId, r); } catch (e) { console.log("[hydrium-ROOMS] player rooms: " + e.message); }
    return out;
}
const norm = (n) => String(n || "").toLowerCase().replace(/[\s_-]+/g, "");
function byName(name) {
    const k = norm(name);
    if (!k) return null;
    for (const r of allRooms().values()) if (norm(r.Name) === k) return r;
    return null;
}
const idList = (v) => [].concat(v ?? []).flatMap(x => String(x).split(",")).map(Number);
const handledIds = (ids) => { const m = allRooms(); return ids.filter(i => m.has(i)).map(i => m.get(i)); };

// ---- GET /rooms?name=X ----
router.get("/rooms", (req, res, next) => {
    const r = byName(req.query.name);
    if (r) {
        console.log(`[hydrium-ROOMS] lookup per nome ${r.Name}`);
        return res.status(200).json(r);
    }
    next();
});

// ---- aggiunge le nostre stanze alla risposta (array) di Hydrium ----
function addToArrayResponse(res, records) {
    const orig = res.json.bind(res);
    res.json = (body) => {
        const arr = Array.isArray(body) ? body : [];
        for (const r of records) if (!arr.some(x => x && x.RoomId === r.RoomId)) arr.push(r);
        res.status(200);
        return orig(arr);
    };
}

// ---- GET /rooms/bulk?id=..  oppure  ?name=X (il watch usa il nome) ----
router.get("/rooms/bulk", (req, res, next) => {
    const mine = handledIds(idList(req.query.id));
    if (mine.length) {
        console.log(`[hydrium-ROOMS] bulk con id ${mine.map(r => r.RoomId)}`);
        addToArrayResponse(res, mine);
        return next();
    }
    if (req.query.id === undefined) {
        const found = [].concat(req.query.name ?? []).flatMap(x => String(x).split(",")).map(byName).filter(Boolean);
        if (found.length) {
            console.log(`[hydrium-ROOMS] bulk per nome ${found.map(r => r.Name)}`);
            return res.status(200).json(found);
        }
    }
    next();
});

// ---- POST /rooms/bulk (id nel corpo del form) ----
router.post("/rooms/bulk", (req, res, next) => {
    const b = req.body || {};
    const key = Object.keys(b).find(k => k.toLowerCase() === "id");
    const mine = key ? handledIds(idList(b[key])) : [];
    if (mine.length) {
        console.log(`[hydrium-ROOMS] POST bulk con ${mine.map(r => r.RoomId)}`);
        addToArrayResponse(res, mine);
    }
    next();
});

// ---- liste del watch / menu stanze ----
// Solo le stanze visibili (Accessibility 1); il tag filtra (rro, pvp, quest...), nessun tag = tutte.
function listed(tag) {
    const t = String(tag || "").toLowerCase();
    // the main feed asks for tag=rro, which player-made rooms never carry: published player rooms belong in it too
    let mineIds = new Set();
    if (t === "rro") { try { mineIds = new Set(require("./hydrium-userrooms").records(applySaves).map(r => r.RoomId)); } catch (_) { /* no player rooms */ } }
    const out = [...allRooms().values()].filter(r =>
        r.Accessibility === 1 && !r.IsDorm && (t === "" || mineIds.has(r.RoomId) || (r.Tags || []).some(x => String(x.Tag).toLowerCase() === t)));
    return mineIds.size ? [...out.filter(r => !mineIds.has(r.RoomId)), ...out.filter(r => mineIds.has(r.RoomId)).sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)))] : out;
}
router.get("/rooms/hot", (req, res) => {
    const all = listed(req.query.tag);
    const skip = Math.max(0, Number(req.query.skip) || 0);
    const take = Number(req.query.take) > 0 ? Number(req.query.take) : all.length;
    console.log(`[hydrium-ROOMS] rooms/hot tag="${req.query.tag || ""}" -> ${all.length}`);
    res.status(200).json({ Results: all.slice(skip, skip + take), TotalResults: all.length });
});
router.get("/rooms/recommendations", (req, res) => {
    console.log("[hydrium-ROOMS] rooms/recommendations");
    res.status(200).json(listed("rro"));
});
router.get("/rooms/curated_playlists", (req, res) => res.status(200).json([]));

// ---- file dati delle stanze: GET /room/<nome> (il client li scarica dal "CDN") ----
router.get(/^\/room\/(.+)$/, (req, res, next) => {
    let rel;
    try { rel = decodeURIComponent(req.params[0] || ""); } catch (_) { return res.status(400).end(); }
    const base = path.resolve(DATA_DIR, "room");
    const abs = path.resolve(base, rel);
    if (abs !== base && !abs.startsWith(base + path.sep)) return res.status(400).end();
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        console.log(`[hydrium-ROOMS] file dati mancante: room/${rel}`);
        return res.status(404).end();
    }
    console.log(`[hydrium-ROOMS] file dati: room/${rel}`);
    res.sendFile(abs, { headers: { "Content-Type": "application/octet-stream" } });
});

// ---- GET /rooms/2 ----
router.get("/rooms/:roomId", (req, res, next) => {
    const r = allRooms().get(Number(req.params.roomId));
    if (!r) return next();
    console.log(`[hydrium-ROOMS] dettagli ${r.Name}`);
    res.status(200).json(r);
});

// ---- istanze pubbliche condivise (una lista per stanza+sottostanza) ----
const instances = new Map(); // "roomId:subRoomId" -> [{inst, born}]

// quando un salvataggio diventa quello attuale, anche chi entra in un'istanza gia' aperta
// riceve i dati nuovi
saves.onChange((roomId, subRoomId, st) => {
    const blob = st.current ? st.current.DataBlob : null;
    if (!blob) return;
    for (const e of instances.get(`${roomId}:${subRoomId}`) || []) {
        e.inst.dataBlob = blob;
        e.inst.dataBlobName = blob;
    }
});

function locks() {
    const m = require("./match").activeRoomByLoginLock;
    if (!m) throw new Error("match.js non esporta activeRoomByLoginLock: lancia node apply-rooms.js");
    return m;
}

function playersIn(inst, map) {
    let n = 0;
    for (const v of map.values()) if (v && v.roomInstanceId === inst.roomInstanceId) n++;
    return n;
}

function newInstance(room, sub) {
    const id = Math.floor(Math.random() * 900000000) + 1000000;
    const blob = saves.currentBlob(room.RoomId, sub.SubRoomId) || sub.DataBlob || (room.RoomId === REC_ID ? currentBlob() : "");
    return {
        roomInstanceId: id, gameSessionId: id, roomId: room.RoomId, subRoomId: sub.SubRoomId,
        roomSceneId: sub.SubRoomId, roomSceneLocationId: sub.UnitySceneId, location: sub.UnitySceneId,
        name: room.Name, photonRegionId: REGION, photonRegion: REGION,
        photonRoomId: `hydrium${room.Name}-${id}-room`, isSandbox: !!sub.IsSandbox, dataBlobName: blob,
        dataBlob: blob, isPrivate: false, isFull: false, gameInProgress: false,
        maxCapacity: sub.MaxPlayers || room.MaxPlayers || 12
    };
}

function handleMatchmake(req, res, next) {
    const room = allRooms().get(Number(req.params.roomId));
    if (!room) return next();
    const wanted = Number(req.params.subRoomId);
    const sub = room.SubRooms.find(s => s.SubRoomId === wanted) || room.SubRooms[0];
    const cap = sub.MaxPlayers || room.MaxPlayers || 12;
    const loginLock = req.body?.LoginLock ?? req.body?.loginLock ?? null;
    const map = locks();

    // se la persona e' gia' in questa stanza pubblica la lascio dov'e'
    let inst = null;
    const cur = loginLock ? map.get(String(loginLock)) : null;
    if (cur && cur.roomId === room.RoomId && cur.subRoomId === sub.SubRoomId && cur.isPrivate === false) inst = cur;

    if (!inst) {
        const key = `${room.RoomId}:${sub.SubRoomId}`;
        const list = instances.get(key) || [];
        for (let i = list.length - 1; i >= 0; i--) {
            if (playersIn(list[i].inst, map) < cap) { inst = list[i].inst; break; }
        }
        if (!inst) {
            inst = newInstance(room, sub);
            list.push({ inst, born: Date.now() });
            if (list.length > 20) list.shift();
            instances.set(key, list);
        }
    }

    inst.isFull = false;
    if (loginLock) map.set(String(loginLock), inst);
    console.log(`[hydrium-ROOMS] matchmake ${room.Name}/${sub.Name} -> istanza ${inst.roomInstanceId} (${playersIn(inst, map)}/${cap})`);
    return res.status(200).json({ errorCode: 0, roomInstance: inst });
}

router.post("/matchmake/room/:roomId/:subRoomId", handleMatchmake);
router.post("/matchmake/room/:roomId", handleMatchmake);

module.exports = { router, roomRecord, allRooms };