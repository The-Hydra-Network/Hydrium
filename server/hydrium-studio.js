
"use strict";

// ============================================================
// HYDRIUM STUDIO
// PATCHKIT API V1 COMPATIBILITY
// ============================================================

const express = require("express");
const fs = require("node:fs");
const crypto = require("node:crypto");

const store = require("./hydrium-studio-storage");

const router = express.Router();

const APP_SECRET =
    process.env.HYDRIUM_PATCHKIT_APP_SECRET ||
    "b97dfb56edfa61619d532a9b5739e39f";

const API_KEY =
    process.env.HYDRIUM_PATCHKIT_API_KEY || "";

const PUBLIC_URL =
    (process.env.HYDRIUM_PATCHKIT_PUBLIC_URL || "")
        .replace(/\/+$/, "");

const CHUNK_LIMIT = Number(
    process.env.HYDRIUM_PATCHKIT_CHUNK_LIMIT ||
    12 * 1024 * 1024
);

const STUDIO_VERSION =
    process.env.HYDRIUM_STUDIO_VERSION || "8.0.0";

const STUDIO_CHANNEL =
    process.env.HYDRIUM_STUDIO_CHANNEL || "stable";

let initialized = store.init();

// ============================================================
// INITIALIZATION
// ============================================================

router.use(async (req, res, next) => {
    try {
        await initialized;
        next();
    } catch (err) {
        console.error("[HYDRIUM-STUDIO]", err);

        res.status(500).json({
            error: "storage_initialization_failed"
        });
    }
});

// ============================================================
// HELPERS
// ============================================================

function fail(res, status, message) {
    return res.status(status).json({
        error: message
    });
}

function requireApiKey(req, res, next) {
    if (!API_KEY) {
        return fail(
            res,
            503,
            "Management API disabled"
        );
    }

    const supplied =
        req.get("X-Api-Key") || "";

    const a = Buffer.from(supplied);
    const b = Buffer.from(API_KEY);

    if (
        a.length !== b.length ||
        !crypto.timingSafeEqual(a, b)
    ) {
        return fail(res, 401, "Unauthorized");
    }

    next();
}

function findApp(req, res, next) {
    const app = store.appBySecret(
        req.params.secret
    );

    if (!app) {
        return fail(res, 404, "Application not found");
    }

    req.patchkitApp = app;

    next();
}

function findVersion(req, res, next) {
    const version = store.versionById(
        req.patchkitApp,
        req.params.versionId
    );

    if (!version) {
        return fail(res, 404, "Version not found");
    }

    req.patchkitVersion = version;

    next();
}

function publicUrl(req, endpoint) {
    return (
        PUBLIC_URL ||
        `${req.protocol}://${req.get("host")}`
    ) + endpoint;
}

function latestVersion(app) {
    return store.state.versions
        .filter(version =>
            version.app_secret === app.secret &&
            version.published
        )
        .sort((a, b) => b.id - a.id)[0] || null;
}

function parseContentRange(value) {
    const match = String(value || "").match(
        /^bytes\s+(\d+)-(\d+)\/(\d+)$/i
    );

    if (!match) return null;

    return {
        start: Number(match[1]),
        end: Number(match[2]),
        total: Number(match[3])
    };
}

function parseMultipart(buffer, contentType) {
    const match = String(contentType || "").match(
        /boundary=(?:"([^"]+)"|([^;]+))/i
    );

    if (!match) {
        return {
            chunk: buffer,
            md5: null
        };
    }

    const boundary = Buffer.from(
        "--" + (match[1] || match[2])
    );

    let position = 0;
    let chunk = null;
    let md5 = null;

    while (
        (position = buffer.indexOf(
            boundary,
            position
        )) !== -1
    ) {
        position += boundary.length;

        if (
            buffer.subarray(
                position,
                position + 2
            ).toString() === "--"
        ) {
            break;
        }

        if (
            buffer.subarray(
                position,
                position + 2
            ).toString() === "\r\n"
        ) {
            position += 2;
        }

        const headerEnd = buffer.indexOf(
            Buffer.from("\r\n\r\n"),
            position
        );

        if (headerEnd < 0) break;

        const headers = buffer.subarray(
            position,
            headerEnd
        ).toString();

        const next = buffer.indexOf(
            boundary,
            headerEnd + 4
        );

        if (next < 0) break;

        let bodyEnd = next;

        if (
            buffer.subarray(
                bodyEnd - 2,
                bodyEnd
            ).toString() === "\r\n"
        ) {
            bodyEnd -= 2;
        }

        const body = buffer.subarray(
            headerEnd + 4,
            bodyEnd
        );

        if (/name="chunk"/i.test(headers)) {
            chunk = body;
        }

        if (/name="md5"/i.test(headers)) {
            md5 = body.toString().trim();
        }

        position = next;
    }

    return {
        chunk: chunk || buffer,
        md5
    };
}

function sendArchive(res, filePath, filename) {
    res.set({
        "Content-Type": "application/zip",
        "Content-Disposition":
            `attachment; filename="${filename.replace(/["\r\n]/g, "_")}"`,
        "Cache-Control": "public, max-age=31536000, immutable"
    });

    const stream = fs.createReadStream(filePath);

    stream.on("error", err => {
        console.error("[PATCHKIT DOWNLOAD]", err);

        if (!res.headersSent) {
            res.status(500).end();
        } else {
            res.destroy(err);
        }
    });

    stream.pipe(res);
}

// ============================================================
// HYDRIUM STUDIO UPDATER
// Separate from PatchKit
// ============================================================

router.get(
    ["/version", "/versions"],
    (req, res) => {
        res.set("Cache-Control", "no-store");

        return res.json([{
            id: `hydrium_${STUDIO_VERSION}_${STUDIO_CHANNEL}`,

            version: STUDIO_VERSION,
            channel: STUDIO_CHANNEL,

            releaseNotes: "Hydrium Studio",

            mandatory: false,

            publishedAt:
                process.env.HYDRIUM_STUDIO_PUBLISHED_AT ||
                "2026-11-11T10:00:00Z",

            files: [],

            packages: process.env.HYDRIUM_STUDIO_PACKAGE_URL
                ? [{
                    id: "hydrium-studio-package",

                    url: process.env.HYDRIUM_STUDIO_PACKAGE_URL,

                    size: Number(
                        process.env.HYDRIUM_STUDIO_PACKAGE_SIZE || 0
                    ),

                    sha256:
                        process.env.HYDRIUM_STUDIO_PACKAGE_SHA256 || "",

                    compression:
                        process.env.HYDRIUM_STUDIO_PACKAGE_COMPRESSION ||
                        "LZMA2",

                    isRequired: true
                }]
                : [],

            checksums: {
                algorithm: "SHA256",
                blockSize: 4194304
            }
        }]);
    }
);

// ============================================================
// HEALTH
// ============================================================

router.get(
    "/studio/health",
    (req, res) => {
        res.json({
            success: true,
            service: "Hydrium Studio",
            protocol: "PatchKit v1"
        });
    }
);

// ============================================================
// PATCHKIT APPLICATION API
// ============================================================

router.get(
    "/1/apps/:secret",
    findApp,
    (req, res) => {
        res.json(req.patchkitApp);
    }
);

// ============================================================
// VERSION LIST
// ============================================================

router.get(
    "/1/apps/:secret/versions",
    findApp,
    (req, res) => {
        res.json(
            store.listVersions(req.patchkitApp)
        );
    }
);

// ============================================================
// LATEST VERSION ID
// ============================================================

router.get(
    "/1/apps/:secret/versions/latest/id",
    findApp,
    (req, res) => {
        const version = latestVersion(
            req.patchkitApp
        );

        if (!version) {
            return fail(res, 404, "No published version");
        }

        res.json({
            id: version.id
        });
    }
);

// ============================================================
// VERSION DETAILS
// ============================================================

router.get(
    "/1/apps/:secret/versions/:versionId",
    findApp,
    findVersion,
    (req, res) => {
        res.json(
            store.publicVersion(
                req.patchkitVersion
            )
        );
    }
);

// ============================================================
// CONTENT SUMMARY
// ============================================================

router.get(
    "/1/apps/:secret/versions/:versionId/content_summary",
    findApp,
    findVersion,
    (req, res) => {
        const version = req.patchkitVersion;

        res.json({
            version_id: version.id,

            label: version.label,

            file_count: version.file_count || 0,

            size: version.content_size || 0,

            sha256: version.content_sha256 || null,

            processed: !!version.processed,

            published: !!version.published
        });
    }
);

// ============================================================
// CONTENT URLS
// ============================================================

router.get(
    "/1/apps/:secret/versions/:versionId/content_urls",
    findApp,
    findVersion,
    (req, res) => {
        const version = req.patchkitVersion;

        if (!version.published) {
            return fail(res, 404, "Version not published");
        }

        const url = publicUrl(
            req,
            `/1/apps/${version.app_secret}/versions/${version.id}/download`
        );

        res.json({
            content_url: url,
            url,

            size: version.content_size,

            sha256: version.content_sha256
        });
    }
);

// ============================================================
// DIFF ENDPOINTS
// ============================================================

router.get(
    "/1/apps/:secret/versions/:versionId/diff_summary",
    findApp,
    findVersion,
    (req, res) => {
        res.json({
            version_id: req.patchkitVersion.id,

            available: false,

            mode: "full",

            files: [],

            message:
                "Binary delta generation is not implemented"
        });
    }
);

router.get(
    "/1/apps/:secret/versions/:versionId/diff_urls",
    findApp,
    findVersion,
    (req, res) => {
        res.json({
            available: false,
            urls: []
        });
    }
);

// ============================================================
// CHANGELOG
// ============================================================

router.get(
    "/1/apps/:secret/changelog",
    findApp,
    (req, res) => {
        const entries = store.state.versions
            .filter(version =>
                version.app_secret === req.patchkitApp.secret &&
                version.published
            )
            .sort((a, b) => b.id - a.id)
            .map(version => ({
                id: version.id,

                label: version.label,

                changelog: version.changelog || "",

                publish_date: version.publish_date
            }));

        res.json(entries);
    }
);

// ============================================================
// DOWNLOAD
// ============================================================

router.get(
    "/1/apps/:secret/versions/:versionId/download",
    findApp,
    findVersion,
    async (req, res) => {
        const version = req.patchkitVersion;

        if (!version.published) {
            return fail(res, 404, "Version not published");
        }

        const content = await store.getVersionContent(
            version
        );

        if (!content) {
            return fail(res, 404, "Content not found");
        }

        sendArchive(
            res,
            content.path,
            `${req.patchkitApp.name}-${version.label}.zip`
        );
    }
);

// ============================================================
// MANAGEMENT API
// ============================================================

// Create application
router.post(
    "/1/apps",
    requireApiKey,
    express.json({ limit: "1mb" }),
    async (req, res) => {
        try {
            const app = await store.createApp({
                name: req.body.name,
                platform: req.body.platform
            });

            res.status(201).json(app);

        } catch (err) {
            fail(res, 400, err.message);
        }
    }
);

// Create version
router.post(
    "/1/apps/:secret/versions",
    requireApiKey,
    findApp,
    express.json({ limit: "1mb" }),
    async (req, res) => {
        try {
            const version = await store.createVersion(
                req.patchkitApp,
                {
                    label: req.body.label,
                    changelog: req.body.changelog
                }
            );

            res.status(201).json(version);

        } catch (err) {
            fail(res, 400, err.message);
        }
    }
);

// ============================================================
// CREATE UPLOAD
// ============================================================

router.post(
    "/1/uploads",
    requireApiKey,
    express.json({ limit: "1mb" }),
    async (req, res) => {
        try {
            const upload = await store.createUpload(
                req.body.total_size_bytes
            );

            res.status(201).json(upload);

        } catch (err) {
            fail(res, 400, err.message);
        }
    }
);

// ============================================================
// UPLOAD CHUNK
// ============================================================

router.post(
    "/1/uploads/:uploadId/chunk",
    requireApiKey,
    express.raw({
        type: () => true,
        limit: CHUNK_LIMIT
    }),
    async (req, res) => {
        try {
            const upload = store.uploadById(
                req.params.uploadId
            );

            if (!upload) {
                return fail(res, 404, "Upload not found");
            }

            const range = parseContentRange(
                req.get("Content-Range")
            );

            if (!range) {
                return fail(res, 400, "Invalid Content-Range");
            }

            const parsed = parseMultipart(
                Buffer.isBuffer(req.body)
                    ? req.body
                    : Buffer.alloc(0),

                req.get("Content-Type")
            );

            const result = await store.appendChunk(
                upload,
                range.start,
                range.end,
                range.total,
                parsed.chunk,
                parsed.md5
            );

            res.status(201).json(result);

        } catch (err) {
            fail(res, 400, err.message);
        }
    }
);

// ============================================================
// ASSIGN CONTENT TO VERSION
// ============================================================

router.put(
    "/1/apps/:secret/versions/:versionId/content_file",
    requireApiKey,
    findApp,
    findVersion,
    express.json({ limit: "1mb" }),
    async (req, res) => {
        try {
            const upload = store.uploadById(
                req.body.upload_id
            );

            if (!upload) {
                return fail(res, 404, "Upload not found");
            }

            const job = await store.createJob(
                req.patchkitVersion,
                upload
            );

            setImmediate(() => {
                store.processJob(job).catch(err => {
                    console.error("[PATCHKIT JOB]", err);
                });
            });

            res.status(202).json({
                job_guid: job.job_guid
            });

        } catch (err) {
            fail(res, 400, err.message);
        }
    }
);

// ============================================================
// BACKGROUND JOB
// ============================================================

router.get(
    "/1/background_jobs/:guid",
    requireApiKey,
    (req, res) => {
        const job = store.jobByGuid(
            req.params.guid
        );

        if (!job) {
            return fail(res, 404, "Job not found");
        }

        const {
            app_secret,
            upload_id,
            version_id,
            ...publicJob
        } = job;

        res.json(publicJob);
    }
);

// ============================================================
// PUBLISH VERSION
// ============================================================

router.post(
    "/1/apps/:secret/versions/:versionId/publish",
    requireApiKey,
    findApp,
    findVersion,
    async (req, res) => {
        try {
            const version = await store.publishVersion(
                req.patchkitApp,
                req.patchkitVersion
            );

            res.json(version);

        } catch (err) {
            fail(res, 409, err.message);
        }
    }
);

// ============================================================
// UPLOAD STATUS
// ============================================================

router.get(
    "/1/uploads/:uploadId",
    requireApiKey,
    (req, res) => {
        const upload = store.uploadById(
            req.params.uploadId
        );

        if (!upload) {
            return fail(res, 404, "Upload not found");
        }

        res.json({
            id: upload.id,

            total_size_bytes:
                upload.total_size_bytes,

            received_bytes:
                upload.received_bytes,

            completed:
                upload.completed
        });
    }
);

// ============================================================
// EXPORT
// ============================================================

module.exports = {
    router,

    config: {
        appSecret: APP_SECRET,
        protocol: "PatchKit v1"
    }
};
