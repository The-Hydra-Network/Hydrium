
"use strict";

// ============================================================
// HYDRIUM PATCHKIT STORAGE
// Independent PatchKit-compatible storage implementation
// Node.js 18+
// ============================================================

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(
    process.env.HYDRIUM_PATCHKIT_STORAGE || "./data/patchkit"
);

const BLOBS = path.join(ROOT, "blobs");
const UPLOADS = path.join(ROOT, "uploads");
const DATABASE = path.join(ROOT, "metadata.json");

const MAX_UPLOAD = Number(
    process.env.HYDRIUM_PATCHKIT_MAX_UPLOAD_SIZE ||
    2147483648
);

let state = {
    nextAppId: 1,
    nextVersionId: 1,
    nextUploadId: 1,

    apps: [],
    versions: [],
    uploads: [],
    jobs: []
};

let writeQueue = Promise.resolve();

function uuid() {
    return crypto.randomUUID();
}

function now() {
    return new Date().toISOString();
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

async function init() {
    await fs.promises.mkdir(ROOT, { recursive: true });
    await fs.promises.mkdir(BLOBS, { recursive: true });
    await fs.promises.mkdir(UPLOADS, { recursive: true });

    try {
        const content = await fs.promises.readFile(
            DATABASE,
            "utf8"
        );

        state = {
            ...state,
            ...JSON.parse(content)
        };
    } catch (err) {
        if (err.code !== "ENOENT") throw err;

        await persist();
    }
}

function persist() {
    const content = JSON.stringify(state, null, 2);

    writeQueue = writeQueue.then(async () => {
        const temporary = DATABASE + ".tmp";

        await fs.promises.writeFile(
            temporary,
            content
        );

        await fs.promises.rename(
            temporary,
            DATABASE
        );
    });

    return writeQueue;
}

function appBySecret(secret) {
    return state.apps.find(
        app => app.secret === secret
    ) || null;
}

function versionById(app, versionId) {
    return state.versions.find(version =>
        version.app_secret === app.secret &&
        String(version.id) === String(versionId)
    ) || null;
}

function uploadById(uploadId) {
    return state.uploads.find(
        upload => String(upload.id) === String(uploadId)
    ) || null;
}

function jobByGuid(guid) {
    return state.jobs.find(
        job => job.job_guid === guid
    ) || null;
}

function publicVersion(version) {
    const result = { ...version };

    delete result.archive_path;
    delete result.content_path;

    return result;
}

// ============================================================
// APPLICATIONS
// ============================================================

async function createApp(data = {}) {
    const secret = data.secret ||
        crypto.randomBytes(18).toString("hex");

    if (appBySecret(secret)) {
        throw new Error("Application already exists");
    }

    const app = {
        id: state.nextAppId++,
        secret,
        name: data.name || "Hydrium Studio",
        platform: data.platform || "windows_x86_64",
        created_at: now(),
        updated_at: now()
    };

    state.apps.push(app);

    await persist();

    return clone(app);
}

// ============================================================
// VERSIONS
// ============================================================

async function createVersion(app, data = {}) {
    const existingDraft = state.versions.find(version =>
        version.app_secret === app.secret &&
        version.draft
    );

    if (existingDraft) {
        throw new Error("A draft version already exists");
    }

    if (!data.label) {
        throw new Error("Version label is required");
    }

    const version = {
        id: state.nextVersionId++,
        app_secret: app.secret,

        label: String(data.label),
        changelog: String(data.changelog || ""),

        created_at: now(),
        published_at: null,
        publish_date: 0,

        draft: true,
        published: false,

        processing: false,
        processed: false,
        has_processing_error: false,

        processing_messages: [],

        content_size: 0,
        content_sha256: null,
        file_count: 0,

        archive_path: null,
        content_path: null
    };

    state.versions.push(version);

    await persist();

    return publicVersion(version);
}

// ============================================================
// UPLOADS
// ============================================================

async function createUpload(totalSize) {
    const size = Number(totalSize);

    if (
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_UPLOAD
    ) {
        throw new Error("Invalid upload size");
    }

    const upload = {
        id: state.nextUploadId++,

        total_size_bytes: size,
        received_bytes: 0,

        chunks: [],

        completed: false,
        created_at: now(),

        file_path: path.join(
            UPLOADS,
            `upload-${state.nextUploadId - 1}.bin`
        )
    };

    await fs.promises.writeFile(
        upload.file_path,
        Buffer.alloc(0)
    );

    state.uploads.push(upload);

    await persist();

    return { id: upload.id };
}

async function appendChunk(
    upload,
    start,
    end,
    total,
    buffer,
    expectedMD5
) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw new Error("Empty upload chunk");
    }

    if (
        total !== upload.total_size_bytes ||
        start < 0 ||
        end < start ||
        end - start + 1 !== buffer.length ||
        end >= total
    ) {
        throw new Error("Invalid Content-Range");
    }

    const md5 = crypto
        .createHash("md5")
        .update(buffer)
        .digest("hex");

    if (
        expectedMD5 &&
        md5.toLowerCase() !==
        String(expectedMD5).toLowerCase()
    ) {
        throw new Error("MD5 mismatch");
    }

    const overlap = upload.chunks.some(chunk =>
        !(end < chunk.start || start > chunk.end)
    );

    if (overlap) {
        throw new Error("Chunk overlap");
    }

    const file = await fs.promises.open(
        upload.file_path,
        "r+"
    );

    try {
        await file.write(
            buffer,
            0,
            buffer.length,
            start
        );

        await file.sync();
    } finally {
        await file.close();
    }

    upload.chunks.push({
        start,
        end,
        md5
    });

    upload.chunks.sort(
        (a, b) => a.start - b.start
    );

    upload.received_bytes =
        upload.chunks.reduce(
            (totalBytes, chunk) =>
                totalBytes + chunk.end - chunk.start + 1,
            0
        );

    upload.completed =
        upload.received_bytes === total &&
        upload.chunks.length > 0 &&
        upload.chunks[0].start === 0 &&
        upload.chunks.every((chunk, index) =>
            index === 0 ||
            upload.chunks[index - 1].end + 1 === chunk.start
        );

    await persist();

    return {
        received_bytes: upload.received_bytes,
        total_size_bytes: total,
        completed: upload.completed
    };
}

// ============================================================
// ZIP VALIDATION
// ============================================================

function inspectZip(buffer) {
    const minimum = Math.max(
        0,
        buffer.length - 65557
    );

    let eocd = -1;

    for (
        let i = buffer.length - 22;
        i >= minimum;
        i--
    ) {
        if (buffer.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }

    if (eocd < 0) {
        throw new Error("Invalid ZIP archive");
    }

    const entries = buffer.readUInt16LE(eocd + 10);

    const centralSize =
        buffer.readUInt32LE(eocd + 12);

    const centralOffset =
        buffer.readUInt32LE(eocd + 16);

    if (
        centralOffset + centralSize > buffer.length ||
        entries > 100000
    ) {
        throw new Error("Invalid ZIP directory");
    }

    let position = centralOffset;
    let files = 0;

    for (let i = 0; i < entries; i++) {
        if (
            position + 46 > buffer.length ||
            buffer.readUInt32LE(position) !== 0x02014b50
        ) {
            throw new Error("Corrupt ZIP directory");
        }

        const nameLength =
            buffer.readUInt16LE(position + 28);

        const extraLength =
            buffer.readUInt16LE(position + 30);

        const commentLength =
            buffer.readUInt16LE(position + 32);

        const name = buffer.subarray(
            position + 46,
            position + 46 + nameLength
        ).toString("utf8");

        if (name && !name.endsWith("/")) {
            files++;
        }

        position +=
            46 +
            nameLength +
            extraLength +
            commentLength;
    }

    return {
        entries,
        file_count: files
    };
}

// ============================================================
// BACKGROUND JOBS
// ============================================================

async function createJob(version, upload) {
    if (!upload.completed) {
        throw new Error("Upload incomplete");
    }

    const job = {
        job_guid: uuid(),

        app_secret: version.app_secret,
        version_id: version.id,
        upload_id: upload.id,

        pending: true,
        finished: false,

        progress: 0,
        status: 0,

        status_message: "queued",

        time_started: now(),
        time_finished: null
    };

    state.jobs.push(job);

    version.processing = true;
    version.processed = false;

    await persist();

    return clone(job);
}

async function processJob(job) {
    const version = state.versions.find(
        item => item.id === job.version_id
    );

    const upload = uploadById(job.upload_id);

    if (!version || !upload) {
        throw new Error("Version or upload missing");
    }

    try {
        job.status_message = "validating archive";
        job.progress = 0.2;

        await persist();

        const data = await fs.promises.readFile(
            upload.file_path
        );

        if (data.length !== upload.total_size_bytes) {
            throw new Error("Upload size mismatch");
        }

        const zip = inspectZip(data);

        const sha256 = crypto
            .createHash("sha256")
            .update(data)
            .digest("hex");

        const blobPath = path.join(
            BLOBS,
            `${version.app_secret}-${version.id}-${sha256}.zip`
        );

        await fs.promises.rename(
            upload.file_path,
            blobPath
        );

        version.archive_path = blobPath;
        version.content_path = blobPath;

        version.content_size = data.length;
        version.content_sha256 = sha256;
        version.file_count = zip.file_count;

        version.processed = true;
        version.processing = false;
        version.has_processing_error = false;

        version.processing_messages = [{
            severity: "info",
            message: "ZIP validation completed"
        }];

        job.pending = false;
        job.finished = true;
        job.progress = 1;
        job.status = 1;
        job.status_message = "completed";
        job.time_finished = now();

        await persist();

    } catch (err) {
        version.processing = false;
        version.has_processing_error = true;

        version.processing_messages = [{
            severity: "error",
            message: err.message
        }];

        job.pending = false;
        job.finished = true;
        job.progress = 1;
        job.status = 2;
        job.status_message = err.message;
        job.time_finished = now();

        await persist();
    }

    return clone(job);
}

// ============================================================
// PUBLISHING
// ============================================================

async function publishVersion(app, version) {
    if (
        !version.processed ||
        version.has_processing_error ||
        !version.content_path
    ) {
        throw new Error("Version processing is incomplete");
    }

    version.published = true;
    version.draft = false;

    version.publish_date = Math.floor(
        Date.now() / 1000
    );

    version.published_at = now();

    app.updated_at = now();

    await persist();

    return publicVersion(version);
}

// ============================================================
// DISTRIBUTION
// ============================================================

async function getVersionContent(version) {
    if (!version || !version.published) {
        return null;
    }

    try {
        await fs.promises.access(version.content_path);
    } catch (_) {
        return null;
    }

    return {
        path: version.content_path,
        size: version.content_size,
        sha256: version.content_sha256
    };
}

function listVersions(app) {
    return state.versions
        .filter(v => v.app_secret === app.secret)
        .sort((a, b) => b.id - a.id)
        .map(publicVersion);
}

module.exports = {
    ROOT,
    MAX_UPLOAD,

    state,

    init,
    persist,

    appBySecret,
    versionById,
    uploadById,
    jobByGuid,

    createApp,
    createVersion,

    createUpload,
    appendChunk,

    createJob,
    processJob,

    publishVersion,

    listVersions,
    getVersionContent,

    publicVersion
};
