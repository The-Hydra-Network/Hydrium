"use strict";

// Hydrium - writes everything the server prints to a log file as well as the terminal.
//
// Add this as the FIRST line of index.js (before require("dotenv")):
//   require("./logger");
//
// A new file is started on every run: logs/hydrium-2026-11-01_08-45-00.log
// (override the folder with LOG_DIR). Send me that file instead of copying the terminal.
//
// .env settings (all optional):
//   LOG_DIR=./logs      where the files go
//   LOG_KEEP=10         how many log files to keep (oldest are deleted)
//   LOG_MAX_MB=50       start a new part file when one passes this size
//   LOG_REDACT=1        hide secrets before writing (default on; 0 turns it off)
//
// Redaction hides login tokens (JWTs), "Bearer ..." values, long hex/refresh tokens and the
// value of any environment variable whose name contains SECRET, PASSWORD, TOKEN, KEY or PRIVATE,
// so the file is safe to send. Nothing is changed in what the terminal shows.

const fs = require("fs");
const path = require("path");

const DIR = path.resolve(process.env.LOG_DIR || path.join(__dirname, "logs"));
const KEEP = Math.max(1, parseInt(process.env.LOG_KEEP || "10", 10) || 10);
const MAX_BYTES = Math.max(1, parseFloat(process.env.LOG_MAX_MB || "50") || 50) * 1024 * 1024;
const REDACT = !/^(0|false|no|off)$/i.test(String(process.env.LOG_REDACT || "1"));

const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const STAMP = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

let fd = null;
let part = 1;
let written = 0;
let file = "";

function open() {
    file = path.join(DIR, `hydrium-${STAMP}${part > 1 ? `-part${part}` : ""}.log`);
    fd = fs.openSync(file, "a");
    written = 0;
}

function prune() {
    try {
        const files = fs.readdirSync(DIR).filter((f) => /^hydrium-.*\.log$/.test(f)).sort();
        for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.rmSync(path.join(DIR, f), { force: true });
    } catch {
        /* ignore */
    }
}

try {
    fs.mkdirSync(DIR, { recursive: true });
    prune();
    open();
} catch (err) {
    process.stderr.write(`[LOGGER] Could not open a log file in ${DIR}: ${err.message}\n`);
    fd = null;
}

// ---------- redaction ----------

function secretValues() {
    const out = [];
    for (const [k, v] of Object.entries(process.env)) {
        if (/SECRET|PASSWORD|TOKEN|KEY|PRIVATE/i.test(k) && typeof v === "string" && v.length >= 8) out.push(v);
    }
    return out.sort((a, b) => b.length - a.length);
}
let secrets = null;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function clean(text) {
    let s = text.replace(ANSI, "");
    if (!REDACT) return s;
    if (secrets === null) secrets = secretValues(); // .env is loaded after this file starts, so read lazily
    for (const v of secrets) if (s.includes(v)) s = s.split(v).join("[hidden]");
    s = s.replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[token hidden]");
    s = s.replace(/(Bearer\s+)[A-Za-z0-9._~+\/=-]{12,}/gi, "$1[hidden]");
    s = s.replace(/\b[0-9a-f]{64,}\b/gi, "[hex hidden]");
    return s;
}

// the .env is read after this file, so refresh the list once the server has had time to start
setTimeout(() => (secrets = null), 3000).unref();
setInterval(() => (secrets = null), 60000).unref();

// ---------- tee ----------

function write(chunk) {
    if (fd === null) return;
    try {
        const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        const line = clean(text);
        if (written + line.length > MAX_BYTES) {
            fs.closeSync(fd);
            part++;
            open();
        }
        fs.writeSync(fd, line);
        written += line.length;
    } catch {
        fd = null; // never let logging break the server
    }
}

for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream);
    stream.write = (chunk, encoding, cb) => {
        if (chunk !== undefined && chunk !== null) write(chunk);
        return original(chunk, encoding, cb);
    };
}

// crashes (including unhandled promise rejections, which Node turns into uncaught errors):
// the monitor only records them, Node still behaves exactly as before
process.on("uncaughtExceptionMonitor", (err, origin) => write(`\n[CRASH] ${origin}: ${err && err.stack ? err.stack : err}\n`));

write(`=== Hydrium log started ${d.toISOString()} | node ${process.version} | ${process.platform} ===\n`);
if (fd !== null) console.log(`[LOGGER] Writing the server log to ${file}`);

module.exports = { file: () => file };
