"use strict";

// Hydrium - room saving (Maker Pen saves) for the rooms handled by hydrium-rooms.js
// (RecCenter and the other Rec Room Originals).
//
// Mount in index.js right after hydrium-rooms:
//   app.use(require("./hydrium-roomsave").router);
//
// The client's own endpoint list (CRITICAL_FINDINGS) names these routes; this file implements them:
//
//   POST /upload  (also POST /room)                  upload a room-data file (the Storage host, multipart "File")
//                                                     -> { Filename, Hash, OwnershipProof }, which the client
//                                                     passes back in the save request
//   GET  /rooms/:roomId/subrooms                      subrooms of a room
//   GET  /rooms/:roomId/subrooms/:subRoomId           one subroom (with CurrentSave)
//   GET  /rooms/:roomId/subrooms/:subRoomId/saves     save history, newest first (?take= &skip=)
//   POST /rooms/:roomId/subrooms/:subRoomId/saves     create a save (needs co-owner or creator);
//                                                     goes live only with AutoPublish: true, else staged
//   GET  /rooms/:roomId/subrooms/:subRoomId/saves/:id one save
//   POST /rooms/:roomId/subrooms/:subRoomId/publish_save   make the staged save (or subRoomDataSaveId=<id>) current
//   POST /rooms/:roomId/subrooms/:subRoomId/data      THE SAVE the game sends: JSON with RoomData / SubRoomData
//                                                     ({ Filename, Hash, OwnershipProof } from /upload),
//                                                     PersistenceVersion, Description, AutoPublish ...
//   GET  /rooms/:roomId/subrooms/:subRoomId/data      the current room-data file
//
// Room-data files are then downloaded by the client from GET /room/<DataBlob> (hydrium-rooms.js).
//
// Response shapes follow RecFlare's notes: every mutation answers { success, error, value };
// a save returns value = { room, subRoomDataSave } (the save in camelCase), publish_save returns the
// whole updated room. Request field names beyond AutoPublish / Description / subRoomDataSaveId are
// guesses: everything is parsed permissively
// (multipart, JSON, form or raw bytes) and every request is logged with "[ROOMSAVE]" so the
// real formats can be confirmed from the console.

const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const saves = require("./room-saves");
const HydriumRooms = require("./hydrium-rooms");

// images.js stores extensionless keys in its CDN folder; the Storage host may be sent images too.
let images = null;
try {
    images = require("./images");
} catch {
    /* images.js not installed - image uploads to the Storage host are then treated as room data */
}

const router = express.Router();

const EDIT_ROLE = 30; // co-owner (30) and creator (255) may save; hosts (10) may not

// ---------- helpers ----------

function accountIdOf(req) {
    const auth = req.headers.authorization;
    if (!auth || !/^Bearer /i.test(auth)) return null;
    try {
        const decoded = jwt.verify(auth.substring(7), process.env.HYDRIUM_JWT_SECRET);
        const id = Number(decoded && decoded.sub);
        return Number.isSafeInteger(id) ? id : null;
    } catch {
        return null;
    }
}

function canEdit(accountId, room) {
    return (room.Roles || []).some((r) => Number(r.AccountId) === accountId && Number(r.Role) >= EDIT_ROLE);
}

const short = (v) => String(v).replace(/\s+/g, " ").slice(0, 80);

// Splits a multipart/form-data body into text fields and file parts.
function parseMultipart(body, contentType) {
    const out = { fields: {}, files: [] };
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
    if (!m) return out;
    const boundary = Buffer.from("--" + (m[1] || m[2]).trim());
    let pos = body.indexOf(boundary);
    while (pos !== -1) {
        const start = pos + boundary.length;
        const next = body.indexOf(boundary, start);
        if (next === -1) break;
        let part = body.subarray(start, next);
        if (part.length >= 2 && part[0] === 0x0d && part[1] === 0x0a) part = part.subarray(2);
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd !== -1) {
            const headers = part.subarray(0, headerEnd).toString("latin1");
            let data = part.subarray(headerEnd + 4);
            if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
                data = data.subarray(0, data.length - 2);
            }
            const name = (/name="([^"]*)"/i.exec(headers) || [])[1] || "";
            const filename = (/filename="([^"]*)"/i.exec(headers) || [])[1];
            if (filename !== undefined) out.files.push({ name, filename, data });
            else out.fields[name] = data.toString("utf8");
        }
        pos = next;
    }
    return out;
}

// Reads whatever the client sent: query string, form fields, JSON, multipart or raw bytes.
function readRequest(req) {
    const ct = String(req.headers["content-type"] || "");
    const r = { contentType: ct, fields: {}, files: [], raw: null, body: null, jsonObject: null };

    for (const [k, v] of Object.entries(req.query || {})) r.fields[k] = Array.isArray(v) ? v[0] : v;

    const body = req.body;
    if (Buffer.isBuffer(body)) {
        if (body.length === 0) return r;
        r.body = body;
        if (/multipart\/form-data/i.test(ct)) {
            const mp = parseMultipart(body, ct);
            Object.assign(r.fields, mp.fields);
            r.files = mp.files;
        } else if (/urlencoded/i.test(ct)) {
            for (const [k, v] of new URLSearchParams(body.toString("utf8"))) r.fields[k] = v;
        } else if (/json/i.test(ct)) {
            try {
                const j = JSON.parse(body.toString("utf8"));
                if (j && typeof j === "object" && !Array.isArray(j)) {
                    r.jsonObject = j;
                    for (const [k, v] of Object.entries(j)) r.fields[k] = typeof v === "object" && v !== null ? JSON.stringify(v) : v;
                } else {
                    r.raw = body;
                }
            } catch {
                r.raw = body;
            }
        } else {
            r.raw = body;
        }
    } else if (body && typeof body === "object") {
        Object.assign(r.fields, body); // form body already parsed by index.js
    }
    return r;
}

// Case-insensitive field lookup.
function pick(fields, ...names) {
    const lower = new Map(Object.keys(fields).map((k) => [k.toLowerCase(), k]));
    for (const n of names) {
        const k = lower.get(n.toLowerCase());
        if (k !== undefined && fields[k] !== undefined && fields[k] !== null && fields[k] !== "") return fields[k];
    }
    return undefined;
}

const BLOB_NAME_FIELDS = ["DataBlob", "DataBlobName", "BlobName", "FileName"];

// JSON keys that mark a body as a save request (not room data).
const REQUEST_FIELDS = new Set(
    [...BLOB_NAME_FIELDS, "PersistenceVersion", "UgcVersion", "SubRoomDataSaveId", "SaveId", "DataSaveId", "Id", "AutoPublish", "Description", "RoomData", "SubRoomData", "UnityAssetId", "InventionUsage", "OMVersion"].map((s) => s.toLowerCase())
);

// The room-data bytes in a request, if there are any: a file part, a raw body, or a JSON body
// that is not a save request (no known request fields) - then the whole body is the data.
function dataIn(r) {
    if (r.files.length) return r.files[0].data;
    if (r.raw) return r.raw;
    if (r.jsonObject) {
        const keys = Object.keys(r.jsonObject);
        if (keys.length > 0 && !keys.some((k) => REQUEST_FIELDS.has(k.toLowerCase()))) return r.body;
    }
    return null;
}

// Case-insensitive property of a plain object.
const prop = (o, name) => {
    if (!o || typeof o !== "object") return undefined;
    const k = Object.keys(o).find((x) => x.toLowerCase() === name.toLowerCase());
    return k === undefined ? undefined : o[k];
};

// The files a save refers to. The game sends RoomData and SubRoomData as { Filename, Hash, OwnershipProof }
// (the values it got back from /upload). The subroom's data is what a room loads, so it wins.
function namedBlob(r) {
    const sub = prop(r.jsonObject, "SubRoomData");
    const room = prop(r.jsonObject, "RoomData");
    const subName = prop(sub, "Filename");
    const roomName = prop(room, "Filename");
    if (subName) return { name: String(subName), proof: prop(sub, "OwnershipProof"), roomName: roomName ? String(roomName) : null, from: "SubRoomData" };
    if (roomName) return { name: String(roomName), proof: prop(room, "OwnershipProof"), roomName: null, from: "RoomData" };
    const flat = pick(r.fields, ...BLOB_NAME_FIELDS);
    return flat !== undefined ? { name: String(flat), proof: null, roomName: null, from: "DataBlob" } : null;
}

// Proof that this account uploaded this file (handed out by /upload, checked when a save names the file).
const proofFor = (accountId, name) =>
    crypto.createHmac("sha256", String(process.env.HYDRIUM_JWT_SECRET || "")).update(`${accountId}:${name}`).digest("base64url");

// What /upload answers: the { Filename, Hash, OwnershipProof } the client copies into its save request.
// Hash is left empty (the client skips its hash check when empty). Sent flat and inside a
// { success, error, value } envelope, since the client ignores members it does not know.
function uploadedFile(name, accountId) {
    const file = { Filename: name, Hash: "", OwnershipProof: proofFor(accountId, name) };
    return { ...file, success: true, error: null, value: file };
}

function logRequest(req, r, label) {
    const names = Object.keys(r.fields).map((k) => `${k}=${short(r.fields[k])}`);
    const files = r.files.map((f) => `${f.name || "?"}:${f.data.length}B`);
    console.log(
        `[ROOMSAVE] ${label} ${req.method} ${req.originalUrl} ct="${r.contentType}" bytes=${r.body ? r.body.length : 0}` +
            ` fields=[${names.join(", ")}] files=[${files.join(", ")}] host=${req.headers.host || ""}`
    );
}

const truthy = (v) => v === true || /^(1|true|yes|on)$/i.test(String(v));

// camelCase copy of a record ({ SubRoomDataSaveId } -> { subRoomDataSaveId }, { OMVersion } -> { omVersion }).
const camelKey = (k) => k.replace(/^[A-Z]+(?=[A-Z][a-z])/, (m) => m.toLowerCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
const camel = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [camelKey(k), v]));

// Subroom mutations always answer { success, error, value }.
const fail = (res, status, message) => res.status(status).json({ success: false, error: message, value: null });
const ok = (res, value) => res.status(200).json({ success: true, error: null, value });

function lookup(req, res, next, { needSub = true } = {}) {
    const roomId = Number(req.params.roomId);
    const subRoomId = needSub ? Number(req.params.subRoomId) : null;
    if (!Number.isSafeInteger(roomId) || (needSub && !Number.isSafeInteger(subRoomId))) {
        res.status(400).json({ error: "Bad room or subroom id" });
        return null;
    }
    const room = HydriumRooms.allRooms().get(roomId);
    if (!room) {
        next(); // not one of our rooms (dorm, Orientation...) - leave it to the other routers
        return null;
    }
    let sub = null;
    if (needSub) {
        sub = room.SubRooms.find((s) => s.SubRoomId === subRoomId);
        if (!sub) {
            res.status(404).json({ error: "Subroom not found" });
            return null;
        }
    }
    return { room, sub, roomId, subRoomId };
}

// Returns the signed-in account if it may edit the room, otherwise answers 401/403 and returns null.
function requireEditor(req, res, room) {
    const accountId = accountIdOf(req);
    if (accountId === null) {
        console.log("[ROOMSAVE] rejected: no valid login token");
        fail(res, 401, "Unauthorized");
        return null;
    }
    let dev = false; try { dev = require("./hydrium-devedit").isDevReq(req); } catch (_) {}
    if (!dev && !canEdit(accountId, room)) {
        console.log(`[ROOMSAVE] rejected: account ${accountId} cannot edit ${room.Name} (needs co-owner or creator)`);
        fail(res, 403, "You do not have permission to edit this room");
        return null;
    }
    return accountId;
}

const uploadParser = express.raw({ type: () => true, limit: saves.MAX_BLOB_BYTES + 1024 * 1024 });

// Stores the data (or reuses a named blob) and records a save. Answers the request itself on failure.
function saveFrom(req, res, ctx, accountId, r) {
    const data = dataIn(r);
    const named = namedBlob(r);
    let blob = named ? named.name : undefined;

    try {
        if (data) {
            blob = saves.putBlob(data);
        } else if (blob !== undefined) {
            blob = String(blob);
            if (!saves.isSafeBlobName(blob)) {
                console.log(`[ROOMSAVE] rejected: unsafe DataBlob name "${short(blob)}"`);
                fail(res, 400, "Invalid DataBlob");
                return null;
            }
            if (!saves.hasBlob(blob)) {
                console.log(`[ROOMSAVE] warning: file "${blob}" is not stored here yet - was it uploaded to a different path?`);
            }
            if (named && named.proof && named.proof !== proofFor(accountId, blob)) {
                console.log(`[ROOMSAVE] warning: OwnershipProof for "${blob}" does not match this account (accepted anyway)`);
            }
            console.log(`[ROOMSAVE] save refers to ${blob} (from ${named.from})${named.roomName ? `, RoomData file ${named.roomName}` : ""}`);
        } else {
            console.log("[ROOMSAVE] rejected: no file named - SubRoomData.Filename, RoomData.Filename and DataBlob are all empty (did the /upload reply reach the client with a Filename?)");
            fail(res, 400, "No room data");
            return null;
        }

        const save = saves.createSave({
            roomId: ctx.roomId,
            subRoomId: ctx.subRoomId,
            dataBlob: blob,
            accountId,
            persistenceVersion: pick(r.fields, "PersistenceVersion"),
            ugcVersion: pick(r.fields, "UgcVersion"),
            description: pick(r.fields, "Description"),
            autoPublish: truthy(pick(r.fields, "AutoPublish")),
            roomDataBlob: named && named.roomName && named.roomName !== blob ? named.roomName : undefined,
            omVersion: pick(r.fields, "OMVersion"),
            inventionUsage: pick(r.fields, "InventionUsage"),
            unityAssetId: pick(r.fields, "UnityAssetId"),
        });
        console.log(
            `[ROOMSAVE] saved ${ctx.room.Name}/${ctx.sub.Name} - save ${save.SubRoomDataSaveId}, blob=${save.DataBlob}, ` +
                `by account ${accountId}, ${saves.state(ctx.roomId, ctx.subRoomId).current === save ? "published" : "STAGED (needs publish_save)"}` +
                ` [AutoPublish=${pick(r.fields, "AutoPublish")}, mode=${saves.PUBLISH_MODE}]`
        );
        return save;
    } catch (err) {
        if (err.code === "TOO_LARGE") {
            fail(res, 413, "Room data too large");
        } else {
            console.error("[ROOMSAVE] save failed:", err.message);
            fail(res, 400, "Could not save room data");
        }
        return null;
    }
}

// The whole room as the client sees it (room records already carry the saved data).
const freshRoom = (roomId) => HydriumRooms.allRooms().get(roomId) || null;

// ---------- debugging aid: show everything sent to the Storage host ----------

router.use((req, res, next) => {
    if (/^storage/i.test(req.hostname || "")) {
        console.log(`[ROOMSAVE] storage host request: ${req.method} ${req.originalUrl} ct="${req.headers["content-type"] || ""}" len=${req.headers["content-length"] || 0}`);
    }
    next();
});

// ---------- Storage: upload ----------

function imageKind(buf) {
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
    if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString("latin1"))) return "gif";
    if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
    return null;
}

function handleUpload(req, res) {
    const r = readRequest(req);
    logRequest(req, r, "upload");
    const accountId = accountIdOf(req);
    if (accountId === null) {
        console.log(`[ROOMSAVE] rejected: no valid login token (Authorization header ${req.headers.authorization ? "present but not valid" : "missing"})`);
        return res.status(401).json({ error: "Unauthorized" });
    }
    const data = dataIn(r);
    if (!data) {
        console.log("[ROOMSAVE] rejected: upload has no data");
        return res.status(400).json({ error: "No room data" });
    }
    console.log(`[ROOMSAVE] upload data: ${data.length} bytes, first bytes ${data.subarray(0, 16).toString("hex")}`);

    // An image sent to the Storage host goes to the image store (extensionless key, like RecFlare's storage uploads).
    const kind = imageKind(data);
    if (kind && images && typeof images.putObject === "function") {
        try {
            const key = images.putObject(`${new Date().toISOString().slice(0, 10)}/${require("crypto").randomUUID()}`, data);
            console.log(`[ROOMSAVE] upload is a ${kind} image - stored as image key ${key}`);
            return res.status(200).json({ ImageName: key, ...uploadedFile(key, accountId) });
        } catch (err) {
            console.error("[ROOMSAVE] image upload failed:", err.message);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    try {
        const name = saves.putBlob(data);
        console.log(`[ROOMSAVE] stored room data ${name} (${data.length} bytes)`);
        return res.status(200).json(uploadedFile(name, accountId));
    } catch (err) {
        if (err.code === "TOO_LARGE") return res.status(413).json({ error: "Room data too large" });
        console.error("[ROOMSAVE] upload failed:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
router.post("/upload", uploadParser, handleUpload);
router.put("/upload", uploadParser, handleUpload);
router.post("/room", uploadParser, handleUpload);
router.put("/room", uploadParser, handleUpload);

// ---------- reads ----------

router.get("/rooms/:roomId/subrooms", (req, res, next) => {
    const ctx = lookup(req, res, next, { needSub: false });
    if (!ctx) return;
    return res.status(200).json(ctx.room.SubRooms);
});

router.get("/rooms/:roomId/subrooms/:subRoomId", (req, res, next) => {
    const ctx = lookup(req, res, next);
    if (!ctx) return;
    return res.status(200).json(ctx.sub);
});

router.get("/rooms/:roomId/subrooms/:subRoomId/saves", (req, res, next) => {
    const ctx = lookup(req, res, next);
    if (!ctx) return;
    const list = saves.listSaves(ctx.roomId, ctx.subRoomId, { take: req.query.take, skip: req.query.skip });
    console.log(`[ROOMSAVE] save history ${ctx.room.Name}/${ctx.sub.Name} -> ${list.length}`);
    return res.status(200).json(list);
});

router.get("/rooms/:roomId/subrooms/:subRoomId/saves/:saveId", (req, res, next) => {
    const ctx = lookup(req, res, next);
    if (!ctx) return;
    const save = saves.getSave(req.params.saveId);
    if (!save || save.RoomId !== ctx.roomId || save.SubRoomId !== ctx.subRoomId) {
        return res.status(404).json({ error: "Save not found" });
    }
    return res.status(200).json(save);
});

router.get("/rooms/:roomId/subrooms/:subRoomId/data", (req, res, next) => {
    const ctx = lookup(req, res, next);
    if (!ctx) return;
    const save = req.query.saveId !== undefined ? saves.getSave(req.query.saveId) : saves.state(ctx.roomId, ctx.subRoomId).current;
    const bytes = save && save.RoomId === ctx.roomId && save.SubRoomId === ctx.subRoomId ? saves.readBlob(save.DataBlob) : null;
    if (!bytes) return res.status(404).json({ error: "No saved room data" });
    res.set("Content-Type", "application/octet-stream");
    res.set("Cache-Control", "no-store");
    return res.status(200).send(bytes);
});

// ---------- writes ----------

router.post("/rooms/:roomId/subrooms/:subRoomId/saves", uploadParser, (req, res, next) => {
    const ctx = lookup(req, res, next);
    if (!ctx) return;
    const r = readRequest(req);
    logRequest(req, r, "create save");
    const accountId = requireEditor(req, res, ctx.room);
    if (accountId === null) return;
    const save = saveFrom(req, res, ctx, accountId, r);
    if (!save) return;
    return ok(res, { room: freshRoom(ctx.roomId), subRoomDataSave: camel(save) });
});

router.post("/rooms/:roomId/subrooms/:subRoomId/data", uploadParser, (req, res, next) => {
    const ctx = lookup(req, res, next);
    if (!ctx) return;
    const r = readRequest(req);
    logRequest(req, r, "upload data");
    const accountId = requireEditor(req, res, ctx.room);
    if (accountId === null) return;
    const save = saveFrom(req, res, ctx, accountId, r);
    if (!save) return;
    return ok(res, { room: freshRoom(ctx.roomId), subRoomDataSave: camel(save) });
});

router.post("/rooms/:roomId/subrooms/:subRoomId/publish_save", uploadParser, (req, res, next) => {
    const ctx = lookup(req, res, next);
    if (!ctx) return;
    const r = readRequest(req);
    logRequest(req, r, "publish");
    const accountId = requireEditor(req, res, ctx.room);
    if (accountId === null) return;
    const wanted = pick(r.fields, "SubRoomDataSaveId", "SaveId", "DataSaveId", "Id");
    const published = saves.publish(ctx.roomId, ctx.subRoomId, wanted);
    if (!published) {
        console.log("[ROOMSAVE] publish: nothing to publish");
        return fail(res, 404, "No staged save to publish");
    }
    console.log(`[ROOMSAVE] published ${ctx.room.Name}/${ctx.sub.Name} - save ${published.SubRoomDataSaveId}`);
    return ok(res, freshRoom(ctx.roomId));
});

// Too-large uploads answer 413 instead of a generic error page.
router.use((err, req, res, next) => {
    if (err && err.type === "entity.too.large") {
        console.log("[ROOMSAVE] rejected: request body too large");
        return fail(res, 413, "Room data too large");
    }
    return next(err);
});

module.exports = { router, canEdit };
