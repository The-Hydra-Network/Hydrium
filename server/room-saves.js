"use strict";

// Hydrium - persistent store for room saves.
//
// A "save" is a SubRoomDataSave record pointing at a room-data file (its DataBlob name).
// The files live in roomdata/room/<name>, which is the folder the existing
// GET /room/<name> route in hydrium-rooms.js already serves to the client.
// The records live in roomdata/saves.json.
//
// Per (roomId, subRoomId) the store tracks:
//   current - the published save players load
//   staged  - a saved-but-not-yet-published save
//
// .env settings (all optional):
//   ROOMSAVE_DIR=./roomdata        where saves.json and room/ live
//   ROOMSAVE_AUTOPUBLISH=client    client (default) = like RecFlare: a save goes live only when the
//                                  request says AutoPublish: true, otherwise it is staged until
//                                  publish_save; 1 = every save goes live at once; 0 = never
//   ROOMSAVE_KEEP=25               saves kept per subroom (current/staged are always kept)
//   ROOMSAVE_MAX_MB=50             largest accepted room-data upload

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(process.env.ROOMSAVE_DIR || path.join(__dirname, "roomdata"));
const BLOB_DIR = path.join(DATA_DIR, "room");
const FILE = path.join(DATA_DIR, "saves.json");
const MODE = String(process.env.ROOMSAVE_AUTOPUBLISH || "always").trim().toLowerCase();
const PUBLISH_MODE = /^(1|true|yes|on|always)$/.test(MODE) ? "always" : /^(0|false|no|off|never)$/.test(MODE) ? "never" : "client";
// requested = what the client asked for (AutoPublish in the request)
const wantsPublish = (requested) => (PUBLISH_MODE === "always" ? true : PUBLISH_MODE === "never" ? false : requested === true);
const KEEP = Math.max(1, parseInt(process.env.ROOMSAVE_KEEP || "25", 10) || 25);
const MAX_BLOB_BYTES = Math.floor((parseFloat(process.env.ROOMSAVE_MAX_MB || "50") || 50) * 1024 * 1024);

fs.mkdirSync(BLOB_DIR, { recursive: true });

// ---------- persistence ----------

let db = { nextSaveId: 1, saves: [], rooms: {}, blobs: {} };
try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (j && Array.isArray(j.saves)) {
        db = { nextSaveId: 1, saves: j.saves, rooms: j.rooms || {}, blobs: j.blobs || {} };
    }
} catch {
    /* first run - nothing saved yet */
}
// saves the client left staged (it never calls publish_save) go live, unless publishing is set to "client"/"never"
if (/^(1|true|yes|on|always)$/.test(String(process.env.ROOMSAVE_AUTOPUBLISH || "always").trim().toLowerCase())) {
    let n = 0; for (const sl of Object.values(db.rooms)) if (sl && sl.stagedSaveId != null && sl.stagedSaveId !== sl.currentSaveId) { sl.currentSaveId = sl.stagedSaveId; sl.stagedSaveId = null; n++; }
    if (n) { console.log(`[ROOMSAVE] published ${n} save(s) that were left staged`); try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); } catch { /* retry on next save */ } }
}
db.nextSaveId = Math.max(Number(db.nextSaveId) || 1, db.saves.reduce((m, s) => Math.max(m, Number(s.SubRoomDataSaveId) || 0), 0) + 1);

function persist() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, FILE);
}

const keyOf = (roomId, subRoomId) => `${Number(roomId)}:${Number(subRoomId)}`;
const slot = (roomId, subRoomId) => (db.rooms[keyOf(roomId, subRoomId)] ||= { currentSaveId: null, stagedSaveId: null });

// ---------- blobs (room data files) ----------

// Blob names are used as file paths: letters, digits and . _ - only, optionally in
// sub-folders (a/b), never "..", never absolute.
function isSafeBlobName(name) {
    return (
        typeof name === "string" &&
        name.length > 0 &&
        name.length <= 200 &&
        /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(name) &&
        !name.includes("..") &&
        !name.includes("//") &&
        !name.endsWith("/")
    );
}

function blobPath(name) {
    if (!isSafeBlobName(name)) return null;
    const p = path.resolve(BLOB_DIR, name);
    return p.startsWith(BLOB_DIR + path.sep) ? p : null;
}

function hasBlob(name) {
    const p = blobPath(name);
    try {
        return !!p && fs.statSync(p).isFile();
    } catch {
        return false;
    }
}

function readBlob(name) {
    const p = blobPath(name);
    if (!p || !hasBlob(name)) return null;
    return fs.readFileSync(p);
}

// Stores room data under a fresh random name and returns the name.
function putBlob(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error("empty room data");
    if (buffer.length > MAX_BLOB_BYTES) throw Object.assign(new Error("room data too large"), { code: "TOO_LARGE" });
    const name = crypto.randomUUID();
    const p = blobPath(name);
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, p);
    db.blobs[name] = true; // uploaded through this store, so safe to delete when pruned
    persist();
    return name;
}

function dropBlobIfUnused(name) {
    if (!db.blobs[name]) return; // imported / hand-placed files are never deleted
    if (db.saves.some((s) => s.DataBlob === name)) return;
    const p = blobPath(name);
    try {
        if (p) fs.rmSync(p, { force: true });
    } catch {
        /* ignore */
    }
    delete db.blobs[name];
}

// ---------- saves ----------

const listeners = [];
function onChange(fn) {
    listeners.push(fn);
}
function emit(roomId, subRoomId) {
    const st = state(roomId, subRoomId);
    for (const fn of listeners) {
        try {
            fn(Number(roomId), Number(subRoomId), st);
        } catch (err) {
            console.error("[ROOMSAVE] listener failed:", err.message);
        }
    }
}

function getSave(id) {
    return db.saves.find((s) => s.SubRoomDataSaveId === Number(id)) || null;
}

function state(roomId, subRoomId) {
    const s = db.rooms[keyOf(roomId, subRoomId)];
    return {
        current: s && s.currentSaveId != null ? getSave(s.currentSaveId) : null,
        staged: s && s.stagedSaveId != null ? getSave(s.stagedSaveId) : null,
    };
}

function currentBlob(roomId, subRoomId) {
    const { current } = state(roomId, subRoomId);
    return current ? current.DataBlob : null;
}

// Newest first.
function listSaves(roomId, subRoomId, { take, skip } = {}) {
    const t = Math.min(Math.max(parseInt(take, 10) || 100, 1), 500);
    const s = Math.max(parseInt(skip, 10) || 0, 0);
    return db.saves
        .filter((x) => x.RoomId === Number(roomId) && x.SubRoomId === Number(subRoomId))
        .reverse()
        .slice(s, s + t);
}

function prune(roomId, subRoomId) {
    const mine = db.saves.filter((x) => x.RoomId === Number(roomId) && x.SubRoomId === Number(subRoomId));
    if (mine.length <= KEEP) return;
    const sl = slot(roomId, subRoomId);
    const keepIds = new Set(mine.slice(-KEEP).map((x) => x.SubRoomDataSaveId));
    if (sl.currentSaveId != null) keepIds.add(sl.currentSaveId);
    if (sl.stagedSaveId != null) keepIds.add(sl.stagedSaveId);
    const doomed = mine.filter((x) => !keepIds.has(x.SubRoomDataSaveId));
    db.saves = db.saves.filter((x) => !doomed.includes(x));
    for (const d of doomed) dropBlobIfUnused(d.DataBlob);
}

// Records a new save. dataBlob must be a blob name (see putBlob).
// Returns the new save record.
function createSave({ roomId, subRoomId, dataBlob, accountId, persistenceVersion, ugcVersion, description, autoPublish, roomDataBlob, omVersion, inventionUsage, unityAssetId }) {
    if (!isSafeBlobName(dataBlob)) throw Object.assign(new Error("invalid DataBlob name"), { code: "BAD_BLOB" });
    const sl = slot(roomId, subRoomId);
    const prev = sl.currentSaveId != null ? getSave(sl.currentSaveId) : null;
    const pv = Number.isFinite(Number(persistenceVersion)) && persistenceVersion !== null && persistenceVersion !== ""
        ? Math.trunc(Number(persistenceVersion))
        : (prev ? Number(prev.PersistenceVersion) || 0 : 0) + 1;

    const save = {
        SubRoomDataSaveId: db.nextSaveId++,
        SubRoomId: Number(subRoomId),
        RoomId: Number(roomId),
        DataBlob: dataBlob,
        SavedByAccountId: Number.isSafeInteger(Number(accountId)) ? Number(accountId) : null,
        PersistenceVersion: pv,
        UgcVersion: Number.isFinite(Number(ugcVersion)) && ugcVersion !== undefined && ugcVersion !== null && ugcVersion !== "" ? Math.trunc(Number(ugcVersion)) : 1,
        ModerationState: 0,
        Description: typeof description === "string" && description ? description.slice(0, 1000) : null,
        // extras the client sends with a save (only kept when present)
        ...(roomDataBlob ? { RoomDataBlob: String(roomDataBlob) } : {}),
        ...(omVersion !== undefined && omVersion !== null && omVersion !== "" ? { OMVersion: Number(omVersion) || 0 } : {}),
        ...(typeof inventionUsage === "string" && inventionUsage ? { InventionUsage: inventionUsage.slice(0, 4000) } : {}),
        ...(unityAssetId !== undefined && unityAssetId !== null && unityAssetId !== "" ? { UnityAssetId: unityAssetId } : {}),
        CreatedAt: new Date().toISOString(),
    };
    db.saves.push(save);
    sl.stagedSaveId = save.SubRoomDataSaveId;
    if (wantsPublish(autoPublish === true)) {
        sl.currentSaveId = save.SubRoomDataSaveId;
        sl.stagedSaveId = null;
    }
    prune(roomId, subRoomId);
    persist();
    emit(roomId, subRoomId);
    return save;
}

// Makes a save current. With no saveId, the staged save is published.
// Returns the published save, or null if there was nothing to publish.
function publish(roomId, subRoomId, saveId) {
    const sl = slot(roomId, subRoomId);
    let target = null;
    if (saveId !== undefined && saveId !== null && saveId !== "") {
        const s = getSave(saveId);
        if (s && s.RoomId === Number(roomId) && s.SubRoomId === Number(subRoomId)) target = s;
    } else if (sl.stagedSaveId != null) {
        target = getSave(sl.stagedSaveId);
    }
    if (!target) return null;
    sl.currentSaveId = target.SubRoomDataSaveId;
    if (sl.stagedSaveId === target.SubRoomDataSaveId) sl.stagedSaveId = null;
    persist();
    emit(roomId, subRoomId);
    return target;
}

module.exports = {
    PUBLISH_MODE,
    wantsPublish,
    MAX_BLOB_BYTES,
    isSafeBlobName,
    hasBlob,
    readBlob,
    putBlob,
    createSave,
    publish,
    state,
    currentBlob,
    getSave,
    listSaves,
    onChange,
};