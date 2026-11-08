// hydrium-email.js - email + password flows (shapes copied from RecFlare):
//   POST /account/me/email            set / change the account email (sends a 6-digit code)
//   GET  /account/me/email/pending    the change waiting for its code
//   POST /account/me/email/confirm    spend the code ({code})
//   POST /account/recoverpassword     "forgot password": {email} -> code + link   (with a login token: change password)
//   POST /account/resetpassword       {email, code, newPassword}
//   POST /account/me/changepassword   {oldPassword, newPassword}
//   GET  /reset-password              small web page to finish a recovery
//   GET  /account/me                  same as before, plus the real `email`
//   GET/PUT /api/players/v4/current/contact   the email-preferences screen (was a 404)
// Login with email + password: run apply-email.js once (patches auth.js to use resolveLoginName).
//
// DELIVERY: with no SMTP the 6-digit code is PRINTED IN THIS CONSOLE ("[EMAIL] ..."). Real mail later, no code change:
//   npm i nodemailer   and in .env:
//   HYDRIUM_SMTP_URL=smtps://user:password@smtp.example.com:465
//   HYDRIUM_MAIL_FROM="Hydrium <no-reply@example.com>"
//   HYDRIUM_PUBLIC_URL=https://hydrium.hydranet.dpdns.org      (used in the reset link)
// Mount BEFORE auth, accounts AND hydrium-accounts (that older module also answers /account/me/email, with no code step):
//   app.use(require("./hydrium-email").router);
// An address already saved by hydrium-accounts.js (data/account-extra.json) is adopted automatically.
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pb = require("./pb");

const router = express.Router();
const ACC = () => pb.hydriumCollections.accounts;
const REFRESH = "hydrium_refresh_tokens";
const FAKE = "@hydrium.local";
const TTL = 30 * 60 * 1000, COOLDOWN = 2 * 60 * 1000, DAILY = 5, DAY = 24 * 3600 * 1000;
const DATA = path.join(__dirname, "data");
const CODES = path.join(DATA, "email-codes.json");
const PWSET = path.join(DATA, "password-set.json");

const EMAIL_TAKEN = "That email address is already on another account.";
const EMAIL_CODE_WRONG = "That code is wrong or has expired. Save the address again to be sent a new one.";
const TOO_SOON = "A code was emailed less than two minutes ago. Enter that one, or try again in a minute.";
const QUOTA = "Too many codes have been emailed for this account today. Please try again tomorrow.";
const NOT_SENT = "The confirmation email could not be sent. Please try again later.";
const RESET_WRONG = "That code is wrong or has expired. Request a new recovery email and try again.";

// body parsers only on my own routes (never on the rest of the server)
const P = [express.urlencoded({ extended: true, limit: "50kb" }), express.json({ limit: "50kb" })];

// ---------- tiny json stores ----------
function load(f, d) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } }
function save(f, v) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); }
let store = load(CODES, { codes: {}, sends: {} });
const readMarks = () => { const v = load(PWSET, {}); return Array.isArray(v) ? Object.fromEntries(v.map((i) => [String(i), new Date().toISOString()])) : (v && typeof v === "object" ? v : {}); };
const hasPw = (id) => !!readMarks()[String(id)];
const markPw = (id) => { const m = readMarks(); m[String(id)] = new Date().toISOString(); save(PWSET, m); };
const flush = () => save(CODES, store);

// ---------- one-shot codes (hash only, 1 attempt, 30 min, 2 min cooldown, 5/day) ----------
const hash = (code, salt) => crypto.createHash("sha256").update(salt + "|" + code).digest("hex");
function begin(purpose, id, payload, force) {
    const key = purpose + ":" + id, now = Date.now(), old = store.codes[key];
    const sends = (store.sends[key] || []).filter((t) => now - t < DAY);
    if (!force && old && now - old.sentAt < COOLDOWN) return { refused: "cooldown" };
    if (sends.length >= DAILY) return { refused: "quota" };
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0"), salt = crypto.randomBytes(8).toString("hex");
    store.codes[key] = { hash: hash(code, salt), salt, exp: now + TTL, sentAt: now, payload: payload || null };
    sends.push(now); store.sends[key] = sends; flush();
    return { code };
}
function pending(purpose, id) {
    const c = store.codes[purpose + ":" + id];
    return c && c.hash && c.exp > Date.now() ? c : null;
}
function complete(purpose, id, code) {
    const key = purpose + ":" + id, c = store.codes[key];
    if (!c || !c.hash || c.exp <= Date.now()) return { outcome: "none" };
    const ok = hash(String(code).trim(), c.salt) === c.hash;
    c.hash = null; // a guess (right or wrong) spends the code; the row stays for the cooldown
    flush();
    return ok ? { outcome: "ok", payload: c.payload } : { outcome: "wrong" };
}
function cancel(purpose, id) { const c = store.codes[purpose + ":" + id]; if (c) { c.hash = null; flush(); } }

// ---------- delivery: SMTP if configured, otherwise printed in the console ----------
let mailer = undefined;
function getMailer() {
    if (mailer !== undefined) return mailer;
    mailer = null;
    if (process.env.HYDRIUM_SMTP_URL) {
        try { mailer = require("nodemailer").createTransport(process.env.HYDRIUM_SMTP_URL); console.log("[EMAIL] SMTP enabled"); }
        catch (e) { console.log("[EMAIL] HYDRIUM_SMTP_URL set but nodemailer is missing (npm i nodemailer): " + e.message + " - printing codes instead"); }
    } else console.log("[EMAIL] no SMTP configured: codes are printed in this console");
    return mailer;
}
async function deliver(to, subject, text) {
    const m = getMailer();
    if (m) {
        try { await m.sendMail({ from: process.env.HYDRIUM_MAIL_FROM || "Hydrium <no-reply@localhost>", to, subject, text }); console.log(`[EMAIL] sent "${subject}" to ${to}`); return true; }
        catch (e) { console.log("[EMAIL] send failed: " + e.message); return false; }
    }
    console.log(`\n[EMAIL] ===== (not sent, no SMTP) =====\n[EMAIL] To: ${to}\n[EMAIL] Subject: ${subject}\n${text.split("\n").map((l) => "[EMAIL] " + l).join("\n")}\n[EMAIL] ================================\n`);
    return true;
}
const baseUrl = (req) => (process.env.HYDRIUM_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");

// ---------- addresses saved by the older hydrium-accounts.js (data/account-extra.json, no verification) ----------
const EXTRA = path.resolve(process.env.ACCOUNT_EXTRA_FILE || path.join(DATA, "account-extra.json"));
const extras = () => load(EXTRA, {});
const legacyOf = (id) => { const e = extras()[String(id)]; return e && typeof e.email === "string" && isEmailStr(e.email) ? e.email.trim().toLowerCase() : null; };
function isEmailStr(e) { return typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()); }
const migrated = new Set();
// copy such an address into PocketBase (once), so email login and recovery can find it
async function adopt(rec) {
    if (!rec || real(rec)) return rec;
    const mail = legacyOf(rec.accountId);
    if (!mail || migrated.has(rec.id)) return rec;
    migrated.add(rec.id);
    try { const other = await pb.collection(ACC()).getFirstListItem(pb.filter("email = {:e}", { e: mail })).catch(() => null); if (other && other.id !== rec.id) return rec;
          const u = await pb.collection(ACC()).update(rec.id, { email: mail }); console.log(`[EMAIL] adopted the saved address of account ${rec.accountId} into PocketBase`); return { ...rec, email: u.email || mail }; }
    catch (e) { console.log("[EMAIL] could not adopt saved address: " + e.message); }
    return { ...rec, email: mail };
}

// ---------- account helpers ----------
const isEmail = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const real = (rec) => (rec && rec.email && !String(rec.email).toLowerCase().endsWith(FAKE) ? String(rec.email) : null);
function tokenId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try { const n = Number(jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET, { algorithms: ["HS256"] }).sub); return Number.isSafeInteger(n) ? n : null; } catch { return null; }
}
const byId = (n) => pb.collection(ACC()).getFirstListItem(pb.filter("accountId = {:n}", { n })).catch(() => null);
const byEmail = async (e) => {
    const mail = String(e).trim().toLowerCase();
    const hit = await pb.collection(ACC()).getFirstListItem(pb.filter("email = {:e}", { e: mail })).catch(() => null);
    if (hit) return hit;
    for (const [id, x] of Object.entries(extras())) if (x && typeof x.email === "string" && x.email.trim().toLowerCase() === mail) { const rec = await byId(Number(id)); if (rec) return adopt(rec); }
    return null;
};
const setPw = (rec, pw) => pb.collection(ACC()).update(rec.id, { password: pw, passwordConfirm: pw });
async function revokeSessions(rec) {
    try { for (const t of await pb.collection(REFRESH).getFullList({ filter: pb.filter("account = {:a}", { a: rec.id }) })) await pb.collection(REFRESH).delete(t.id); } catch (_) {}
}
async function me(req, res) {
    const n = tokenId(req);
    if (n === null) { res.status(401).end(); return null; }
    const rec = await adopt(await byId(n));
    if (!rec) { res.status(404).end(); return null; }
    return rec;
}
const isUnique = (e) => /unique|already|exists|validation_not_unique/i.test(JSON.stringify((e && (e.response || e.data)) || "") + (e && e.message));

// used by apply-email.js: lets an email stand in for the username at login
async function resolveLoginName(name) {
    const n = String(name || "").trim();
    if (!n.includes("@")) return n;
    const rec = await byEmail(n);
    return rec ? (real(rec) || n) : n; // an email is always a PocketBase login name; the username may not be
}

// ---------- email set / confirm ----------
router.post("/account/me/email", P, async (req, res) => {
    try {
        const rec = await me(req, res); if (!rec) return;
        const email = String((req.body && req.body.email) || "").trim().toLowerCase();
        if (!isEmail(email)) return res.status(400).end();
        const id = Number(rec.accountId), holder = await byEmail(email);
        if (holder && holder.id !== rec.id) return res.status(400).json({ success: false, error: EMAIL_TAKEN });
        const cur = real(rec);
        if (cur && cur.toLowerCase() === email) return res.json({ success: true });
        let issue, purpose, to;
        if (!cur) { const st = pending("email_verify", id); issue = begin("email_verify", id, email, !st || st.payload !== email); purpose = "email_verify"; to = email; }
        else { cancel("email_verify", id); issue = begin("email_change", id, email, false); purpose = "email_change"; to = cur; }
        if (issue.refused) return res.status(400).json({ success: false, error: issue.refused === "cooldown" ? TOO_SOON : QUOTA });
        const text = purpose === "email_change"
            ? `Someone asked to change your Hydrium email to ${email}.\nCode: ${issue.code}\nIt works once and lasts 30 minutes. If this wasn't you, ignore this email.`
            : `Confirm ${email} for your Hydrium account.\nCode: ${issue.code}\nIt works once and lasts 30 minutes.`;
        if (!(await deliver(to, "Your Hydrium confirmation code", text))) { cancel(purpose, id); return res.status(502).json({ success: false, error: NOT_SENT }); }
        console.log(`[EMAIL] ${purpose} code issued for account ${id}`);
        res.json({ success: true });
    } catch (e) { console.log("[EMAIL] error", e.message); res.status(500).json({ success: false, error: "Server error" }); }
});

router.get("/account/me/email/pending", async (req, res) => {
    const rec = await me(req, res); if (!rec) return;
    const id = Number(rec.accountId), v = pending("email_verify", id), c = pending("email_change", id);
    if (v && v.payload) return res.json({ pending: v.payload, sentTo: v.payload });
    if (c && c.payload) return res.json({ pending: c.payload, sentTo: real(rec) || c.payload });
    res.json({ pending: null, sentTo: null });
});

router.post("/account/me/email/confirm", P, async (req, res) => {
    try {
        const rec = await me(req, res); if (!rec) return;
        const code = String((req.body && req.body.code) || "").trim();
        if (!code) return res.status(400).json({ success: false, error: "Enter the code from the email." });
        const id = Number(rec.accountId), verifying = !!pending("email_verify", id);
        const r = complete(verifying ? "email_verify" : "email_change", id, code);
        if (r.outcome !== "ok" || !r.payload) return res.status(400).json({ success: false, error: EMAIL_CODE_WRONG });
        const email = r.payload, holder = await byEmail(email);
        if (holder && holder.id !== rec.id) return res.status(400).json({ success: false, error: EMAIL_TAKEN });
        if (!verifying) { // current address approved: now the new address confirms itself
            const n = begin("email_verify", id, email, true);
            if (n.refused) return res.status(400).json({ success: false, error: n.refused === "cooldown" ? TOO_SOON : QUOTA });
            if (!(await deliver(email, "Your Hydrium confirmation code", `Confirm ${email} for your Hydrium account.\nCode: ${n.code}\nIt works once and lasts 30 minutes.`))) return res.status(502).json({ success: false, error: NOT_SENT });
            return res.json({ success: true, applied: false, pending: email, sentTo: email });
        }
        try { await pb.collection(ACC()).update(rec.id, { email }); }
        catch (e) { if (isUnique(e)) return res.status(400).json({ success: false, error: EMAIL_TAKEN }); throw e; }
        console.log(`[EMAIL] account ${id} email is now ${email}`);
        res.json({ success: true, applied: true, pending: null, sentTo: null });
    } catch (e) { console.log("[EMAIL] error", e.message); res.status(500).json({ success: false, error: "Server error" }); }
});

// ---------- passwords ----------
async function changePassword(req, res) {
    try {
        const rec = await me(req, res); if (!rec) return;
        const oldPw = String((req.body && req.body.oldPassword) || ""), newPw = String((req.body && req.body.newPassword) || "");
        if (!newPw) return res.status(400).json({ success: false, error: "You must enter a new password." });
        if (newPw.length < 8) return res.status(400).json({ success: false, error: "The password must be at least 8 characters." });
        const id = Number(rec.accountId);
        if (hasPw(id)) { // a password the player chose: the old one must match
            try { await pb.collection(ACC()).authWithPassword(rec.username, oldPw); }
            catch { return res.status(400).json({ success: false, error: "Your old password is incorrect." }); }
        } // else: still the random password made at account creation - nobody knows it, first set is free
        await setPw(rec, newPw);
        markPw(id);
        console.log(`[EMAIL] password changed for account ${id}`);
        res.json({ success: true });
    } catch (e) { console.log("[EMAIL] changepassword error", e.message); res.status(400).json({ success: false, error: "Could not change the password." }); }
}
router.post("/account/me/changepassword", P, changePassword);

const ipHits = new Map();
router.post("/account/recoverpassword", P, async (req, res, next) => {
    if (/^Bearer /i.test(String(req.headers.authorization || ""))) return changePassword(req, res); // Hydrium's older "change password" use
    const ok = { Success: true, Error: null, error_id: null };
    const refuse = (Error) => res.json({ Success: false, Error, error_id: null });
    try {
        const email = String((req.body && req.body.email) || "").trim().toLowerCase();
        if (!email) return refuse("Enter the email address on your account.");
        if (!isEmail(email)) return refuse("That doesn't look like an email address.");
        const ip = String(req.headers["cf-connecting-ip"] || req.ip), now = Date.now();
        const hits = (ipHits.get(ip) || []).filter((t) => now - t < 3600000);
        if (hits.length >= 5) return res.json(ok);
        hits.push(now); ipHits.set(ip, hits);
        const rec = await byEmail(email);
        if (!rec || !real(rec)) { console.log("[EMAIL] recovery asked for an address on no account"); return res.json(ok); }
        const issue = begin("password_reset", Number(rec.accountId), null, false);
        if (issue.refused) return res.json(ok);
        const link = `${baseUrl(req)}/reset-password?email=${encodeURIComponent(email)}&code=${issue.code}`;
        const sent = await deliver(email, "Reset your Hydrium password", `Your recovery code: ${issue.code}\nOr open: ${link}\nIt works once and lasts 30 minutes. If this wasn't you, ignore this email.`);
        if (!sent) return refuse("The recovery email could not be sent. Please try again later.");
        res.json(ok);
    } catch (e) { console.log("[EMAIL] recover error", e.message); refuse("The recovery email could not be sent. Please try again later."); }
});

router.post("/account/resetpassword", P, async (req, res) => {
    const refuse = (error) => res.status(400).json({ success: false, error });
    try {
        const b = req.body || {}, email = String(b.email || "").trim().toLowerCase(), code = String(b.code || "").trim(), pw = String(b.newPassword || "");
        if (!email) return refuse("Enter the email address the code was sent to.");
        if (!code) return refuse("Enter the code from the email.");
        if (!pw) return refuse("You must enter a new password.");
        if (pw.length < 8) return refuse("The password must be at least 8 characters.");
        const rec = await byEmail(email);
        if (!rec) return refuse(RESET_WRONG);
        if (complete("password_reset", Number(rec.accountId), code).outcome !== "ok") return refuse(RESET_WRONG);
        await setPw(rec, pw);
        markPw(rec.accountId);
        await revokeSessions(rec);
        console.log(`[EMAIL] password reset for account ${rec.accountId}`);
        res.json({ success: true });
    } catch (e) { console.log("[EMAIL] reset error", e.message); refuse("Could not reset the password."); }
});

// ---------- the website page the recovery email links to ----------
router.get("/reset-password", (req, res) => res.type("html").set("Cache-Control", "no-store").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset password</title>
<style>:root{color-scheme:light dark}body{font:16px system-ui,sans-serif;max-width:380px;margin:12vh auto;padding:0 16px}h1{font-size:20px}input,button{font:inherit;width:100%;padding:9px 10px;margin:6px 0;box-sizing:border-box;border-radius:8px;border:1px solid #8886}button{background:#2563eb;color:#fff;border:0;cursor:pointer}#m{min-height:1.4em;font-size:14px}</style></head>
<body><h1>Reset your password</h1><form id="f"><input id="e" name="email" type="email" placeholder="Email" required><input id="c" name="code" inputmode="numeric" placeholder="6-digit code" required><input id="p" name="newPassword" type="password" placeholder="New password" autocomplete="new-password" required><button>Set password</button></form><div id="m"></div>
<script>const q=new URLSearchParams(location.search);e.value=q.get("email")||"";c.value=q.get("code")||"";
f.onsubmit=async ev=>{ev.preventDefault();m.textContent="...";const r=await fetch("/account/resetpassword",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({email:e.value,code:c.value,newPassword:p.value})});const j=await r.json().catch(()=>({}));m.textContent=r.ok?"Done. You can sign in with the new password.":(j.error||"Failed");}</script></body></html>`));

// ---------- /account/me also carries the real email ----------
router.get("/account/me", (req, res, next) => {
    const n = tokenId(req);
    if (n === null) return next();
    const orig = res.json.bind(res);
    res.json = (body) => {
        if (body && typeof body === "object" && !Array.isArray(body) && res.statusCode === 200) {
            byId(n).then(adopt).then((rec) => orig({ ...body, email: real(rec) || legacyOf(n) || "" }), () => orig(body));
            return res;
        }
        return orig(body);
    };
    next();
});

// ---------- email preferences screen (shown right after adding an email): saved, nothing is sent ----------
const PREFS = path.join(DATA, "contact-prefs.json");
const DEFAULT_PREFS = { MarketingEmails: false, InviteEmails: false, GameClientTextInvites: false, FriendRequestEmails: 40, CreatorPublishedNewRoomEmails: 40, MyRoomSummaryEmails: 40, NewPhotoTagEmails: 40, PlayerEventInviteEmails: 40, PlayerEventReminderEmails: 40 };
router.get("/api/players/v4/current/contact", (req, res) => { const n = tokenId(req); if (n === null) return res.status(401).end(); res.json({ ...DEFAULT_PREFS, ...(load(PREFS, {})[n] || {}) }); });
router.put("/api/players/v4/current/contact", P, (req, res) => {
    const n = tokenId(req); if (n === null) return res.status(401).end();
    const all = load(PREFS, {}), b = req.body && typeof req.body === "object" ? req.body : {};
    const next = { ...DEFAULT_PREFS, ...(all[n] || {}) };
    for (const k of Object.keys(DEFAULT_PREFS)) if (b[k] !== undefined) next[k] = typeof DEFAULT_PREFS[k] === "boolean" ? (b[k] === true || b[k] === "true" || b[k] === "True") : Number(b[k]);
    all[n] = next; save(PREFS, all);
    res.json(next);
});

getMailer();
module.exports = { router, resolveLoginName };