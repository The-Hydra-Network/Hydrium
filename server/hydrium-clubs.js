"use strict";

// Hydrium - clubs (create, browse, join, leave, members, edit). RecFlare shapes.
// Data: data/clubs.json (env CLUBS_FILE). Must come BEFORE the old club.js (and before auth):
//   app.use(require("./hydrium-clubs").router);

const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const router = express.Router();
const FILE = path.resolve(process.env.CLUBS_FILE || path.join(__dirname, "data", "clubs.json"));
const MAX_PER_ACCOUNT = Number(process.env.MAX_CLUBS_PER_ACCOUNT) || 5;

const BANNED = -1, NONE = 0, REQUESTED = 1, INVITED = 2, MEMBER = 10, MOD = 20, COOWNER = 30, CREATOR = 100;
const VIS = { private: 0, public: 1 };
const JOIN = { open: 0, inviteonly: 1, asktojoin: 2 };

let db = { next: 1, clubs: {} }; // clubs[id] = { club, members: { acct: type }, tags: [] }
try { const j = JSON.parse(fs.readFileSync(FILE, "utf8")); if (j && j.clubs) db = j; } catch { /* first run */ }
function persist() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(db, null, 2));
    fs.renameSync(FILE + ".tmp", FILE);
}

function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const n = Number(jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET).sub);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    } catch { return null; }
}

const count = (e) => Object.values(e.members).filter((t) => t >= MEMBER).length;
const dto = (e) => ({ ...e.club, MemberCount: count(e) });
const mine = (e, a) => (a ? e.members[a] || NONE : NONE);
const perm = (id, type, g = {}) => ({ ClubId: id, Type: type, ApproveMember: false, BanUnban: false, CreateEvent: false, EditDetails: false, EditPermissionSettings: false, PostAnnouncement: false, ...g });
function details(e, a) {
    const id = e.club.ClubId;
    return {
        AdditionalImages: [],
        Club: dto(e),
        ClubId: id,
        CoownerPermissions: perm(id, COOWNER, { ApproveMember: true, BanUnban: true, CreateEvent: true, EditDetails: true, EditPermissionSettings: true, PostAnnouncement: true }),
        CustomTags: e.tags || [],
        MemberPermissions: perm(id, MEMBER),
        ModeratorPermissions: perm(id, MOD, { ApproveMember: true, BanUnban: true }),
        MyMembershipType: mine(e, a),
    };
}
const err = (res, m, s = 200) => res.status(s).json({ error: m, success: false, value: null });
const ok = (res, v) => res.status(200).json({ error: "", success: true, value: v });
const get = (id) => db.clubs[Number(id)] || null;
const parseEnum = (v, map, d) => {
    if (v === undefined || v === null || v === "") return d;
    const s = String(v).toLowerCase();
    if (s in map) return map[s];
    const n = Number(s);
    return Number.isInteger(n) ? n : d;
};
const bool = (v, d) => (v === undefined ? d : /^(true|1)$/i.test(String(v)));

const form = express.urlencoded({ extended: true });
const json = express.json({ type: () => true, limit: "100kb" });
const parse = (req, res, next) => form(req, res, (e) => (e ? next(e) : json(req, res, next)));
const field = (b, name) => {
    const k = Object.keys(b || {}).find((x) => x.toLowerCase() === name.toLowerCase());
    const v = k === undefined ? undefined : b[k];
    return Array.isArray(v) ? v[0] : v;
};

router.get("/club/categoryTags", (req, res) => res.status(200).json(["Social", "Creative", "Competitive", "Casual", "Entertainment"]));

router.post("/club/create", parse, (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).end();
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const name = String(field(b, "name") || "").trim();
    const description = String(field(b, "description") || "");
    if (!name) return err(res, "You must enter a name for your club.");
    if (!/^[\p{L}\p{N} .,'!?&()_-]+$/u.test(name)) return err(res, "Club names can only use letters, numbers, and basic punctuation.");
    if ([...name].length > 32) return err(res, "Club names can be at most 32 characters.");
    if ([...description].length > 500) return err(res, "Club descriptions can be at most 500 characters.");
    const made = Object.values(db.clubs).filter((e) => e.club.CreatorAccountId === me).length;
    if (made >= MAX_PER_ACCOUNT) return err(res, `You can only have ${MAX_PER_ACCOUNT} clubs.`);
    const id = db.next++;
    const mi = Number.parseInt(field(b, "minLevel"), 10);
    const e = {
        club: {
            ClubId: id, Name: name, Description: description,
            Category: String(field(b, "category") || "Social").trim(),
            Visibility: parseEnum(field(b, "visibility"), VIS, 1),
            Joinability: parseEnum(field(b, "joinability"), JOIN, 0),
            AllowJuniors: bool(field(b, "allowJuniors"), true),
            MainImageName: field(b, "mainImageName") || "DefaultImgPurple",
            ClubType: 0, ClubhouseRoomId: null, CreatorAccountId: me, IsRRO: false,
            MinLevel: Number.isNaN(mi) ? 0 : mi, State: 0, MemberCount: 1,
        },
        members: { [me]: CREATOR }, tags: [], createdAt: new Date().toISOString(),
    };
    db.clubs[id] = e;
    persist();
    console.log(`[CLUBS] ${me} created club ${id} "${name}"`);
    ok(res, details(e, me));
});

router.get("/club/mine/member", (req, res) => {
    const me = accountId(req);
    res.status(200).json(me ? Object.values(db.clubs).filter((e) => mine(e, me) >= MEMBER).map(dto) : []);
});
router.get("/club/mine/created", (req, res) => {
    const me = accountId(req);
    res.status(200).json(me ? Object.values(db.clubs).filter((e) => e.club.CreatorAccountId === me).map(dto) : []);
});
router.get("/club/account/:id/created", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const id = Number(req.params.id);
    res.status(200).json(Object.values(db.clubs).filter((e) => e.club.CreatorAccountId === id && e.club.Visibility === 1).map((e) => ({ ...dto(e), ClubChatEnabled: true })));
});
router.get("/account/:id/clubs", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const id = Number(req.params.id);
    res.status(200).json(Object.values(db.clubs).filter((e) => mine(e, id) >= MEMBER && e.club.Visibility === 1).map(dto));
});
router.get("/club/account/:id", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const id = Number(req.params.id);
    res.status(200).json(Object.values(db.clubs).filter((e) => mine(e, id) >= MEMBER && e.club.Visibility === 1).map(dto));
});

router.get("/club/search", (req, res) => {
    const q = String(req.query.query || req.query.q || "").trim().toLowerCase();
    const cat = String(req.query.category || "").trim().toLowerCase();
    const n = Number.parseInt(req.query.count, 10);
    const take = Number.isNaN(n) || n <= 0 || n > 100 ? 30 : n;
    let list = Object.values(db.clubs).filter((e) => e.club.Visibility === 1);
    if (cat) list = list.filter((e) => e.club.Category.toLowerCase() === cat);
    if (q) list = list.filter((e) => e.club.Name.toLowerCase().includes(q) || e.club.Description.toLowerCase().includes(q));
    const sort = String(req.query.sort || "");
    list.sort((a, b) => sort === "2" ? a.club.Name.localeCompare(b.club.Name) : sort === "1" ? b.createdAt.localeCompare(a.createdAt) : count(b) - count(a) || b.createdAt.localeCompare(a.createdAt));
    res.status(200).json({ Clubs: list.slice(0, take).map(dto), ContinuationToken: null, TotalClubs: list.length });
});

router.get("/club/:id/details", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const e = get(req.params.id);
    if (!e) return res.status(404).end();
    res.status(200).json(details(e, accountId(req)));
});
router.get("/club/:id/members", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const e = get(req.params.id);
    const t = req.query.membershipType === undefined ? null : Number(req.query.membershipType);
    const rows = e ? Object.entries(e.members).filter(([, ty]) => (t === null ? ty >= MEMBER : ty === t)).map(([a, ty], i) => ({ ClubMemberId: i + 1, ClubId: e.club.ClubId, AccountId: Number(a), MembershipType: ty, CreatedAt: e.createdAt })) : [];
    ok(res, rows);
});
router.get("/club/:id/hasDisabledClubChat", (req, res, next) => (/^\d+$/.test(req.params.id) ? res.status(200).json(false) : next()));

function join(req, res, next) {
    if (!/^\d+$/.test(req.params.id)) return next();
    const me = accountId(req);
    if (!me) return res.status(401).end();
    const e = get(req.params.id);
    if (!e) return res.status(404).end();
    const cur = mine(e, me);
    if (cur === BANNED || cur >= MEMBER) { /* nothing to change */ }
    else e.members[me] = e.club.Joinability === 0 ? MEMBER : REQUESTED;
    persist();
    console.log(`[CLUBS] ${me} joined/requested club ${e.club.ClubId}: ${e.members[me]}`);
    if (req.path.endsWith("/requesttojoin")) return ok(res, details(e, me));
    res.status(200).json(dto(e));
}
router.put("/club/:id/join", join);
router.post("/club/:id/join", join);
router.post("/club/:id/members/requesttojoin", join);

function leave(req, res, next) {
    if (!/^\d+$/.test(req.params.id)) return next();
    const me = accountId(req);
    if (!me) return res.status(401).end();
    const e = get(req.params.id);
    if (!e) return res.status(404).end();
    if (mine(e, me) === CREATOR) return err(res, "You created this club — delete it instead of leaving.", 403);
    if (mine(e, me) !== BANNED) delete e.members[me];
    persist();
    if (req.path.endsWith("/members/leave")) return ok(res, details(e, me));
    res.status(200).json(dto(e));
}
router.post("/club/:id/leave", leave);
router.put("/club/:id/leave", leave);
router.post("/club/:id/members/leave", leave);
router.put("/club/:id/members/leave", leave);

function modify(req, res, next) {
    if (!/^\d+$/.test(req.params.id)) return next();
    const me = accountId(req);
    if (!me) return res.status(401).end();
    const e = get(req.params.id);
    if (!e) return res.status(404).end();
    if (mine(e, me) < COOWNER) return err(res, "Insufficient permissions.", 403);
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const c = e.club;
    const name = String(field(b, "name") || "").trim();
    if (name) c.Name = name.slice(0, 32);
    const d = field(b, "description");
    if (d) c.Description = String(d).slice(0, 500);
    const cat = field(b, "category");
    if (cat) c.Category = String(cat).trim();
    c.Visibility = parseEnum(field(b, "visibility"), VIS, c.Visibility);
    c.Joinability = parseEnum(field(b, "joinability"), JOIN, c.Joinability);
    c.AllowJuniors = bool(field(b, "allowJuniors"), c.AllowJuniors);
    const img = field(b, "mainImageName");
    if (img) c.MainImageName = img;
    const ml = Number.parseInt(field(b, "minLevel"), 10);
    if (!Number.isNaN(ml)) c.MinLevel = ml;
    const tags = b.customTags ?? b.CustomTags;
    if (tags !== undefined) e.tags = [].concat(tags).filter((t) => typeof t === "string");
    persist();
    ok(res, details(e, me));
}
router.put("/club/:id/modifydetails", parse, modify);
router.put("/club/:id/modify", parse, modify);

router.delete("/club/:id", (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const me = accountId(req);
    const e = get(req.params.id);
    if (!me) return res.status(401).end();
    if (!e) return res.status(404).end();
    if (mine(e, me) !== CREATOR) return err(res, "Insufficient permissions.", 403);
    delete db.clubs[Number(req.params.id)];
    persist();
    ok(res, null);
});

module.exports = { router };
