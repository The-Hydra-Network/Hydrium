"use strict";

// Hydrium - wallet, store purchases, gift boxes and terminal commands.
//
// Routes (RecFlare shapes):
//   GET  /api/storefronts/v4/balance/:currencyType   real balance (replaces the hard-coded 0)
//   POST /api/storefronts/v2/buyItem                 buy from blobs/sf{id}.json catalogs
//   GET  /api/avatar/v2/gifts                        unopened gift boxes
//   POST /api/avatar/v2/gifts/consume                open a gift box
//
// Terminal (type in the server console, press Enter; every command is logged as [CMD]):
//   give <amount> [accountId]      add tokens (default: your own account)
//   take <amount> [accountId]      remove tokens
//   set <amount> [accountId]       set the balance
//   balance [accountId]            show a balance
//   me <accountId>                 change which account "your own" means
//   wallets                        list all wallets
//   help
//
// Mount it in index.js BEFORE hydrium-fixes (which hard-codes the balance to 0):
//   app.use(require("./hydrium-econ-buy").router);
//
// Settings (env): STARTING_TOKENS (10000), HYDRIUM_ME (default account for commands, 290802708),
// WALLET_FILE, WALLET_TERMINAL=0 to disable the terminal reader.

const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const router = express.Router();

const FILE = path.resolve(process.env.WALLET_FILE || path.join(__dirname, "data", "wallets.json"));
const BLOBS = path.resolve(process.env.BLOBS_DIR || path.join(__dirname, "blobs"));
const START = Number.isFinite(Number(process.env.STARTING_TOKENS)) ? Number(process.env.STARTING_TOKENS) : 10000;
const TOKENS = 2; // CurrencyType.RecCenterTokens
const ALL = -1;

// db.w[account][currencyType] = balance ; db.gifts[account] = [giftContent...]
let db = { nextGift: 1, me: Number(process.env.HYDRIUM_ME) || 290802708, w: {}, gifts: {}, owned: {}, cons: {}, nextCons: 1 };
try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (j && j.w) db = { nextGift: j.nextGift || 1, me: Number(process.env.HYDRIUM_ME) || j.me || db.me, w: j.w, gifts: j.gifts || {}, owned: j.owned || {}, cons: j.cons || {}, nextCons: j.nextCons || 1 };
} catch { /* first run */ }

function persist() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, FILE);
}

function balance(acct, cur) {
    const w = (db.w[acct] ||= {});
    if (w[cur] === undefined) w[cur] = cur === TOKENS ? START : 0;
    return w[cur];
}
function setBalance(acct, cur, n) {
    balance(acct, cur);
    db.w[acct][cur] = Math.max(0, Math.floor(n));
    persist();
}

// ---------- auth ----------
function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const d = jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET);
        const id = Number(d.sub);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    } catch { return null; }
}

function tokenPlus(req) {
    try { return jwt.verify(String(req.headers.authorization || "").slice(7), process.env.HYDRIUM_JWT_SECRET)["rn.plus"] === true; } catch { return false; }
}

// ---------- catalogs ----------
const cache = new Map();
function catalog(type) {
    for (const name of [`sf${type}-2025.json`, `sf${type}.json`]) {
        const f = path.join(BLOBS, name);
        try {
            const st = fs.statSync(f);
            const c = cache.get(f);
            if (c && c.m === st.mtimeMs) return c.d;
            const d = JSON.parse(fs.readFileSync(f, "utf8"));
            cache.set(f, { m: st.mtimeMs, d });
            return d;
        } catch { /* try next */ }
    }
    return null;
}
function findItem(type, id) {
    const c = catalog(type);
    return c && Array.isArray(c.StoreItems) ? c.StoreItems.find((i) => i.PurchasableItemId === id) || null : null;
}
function findAnywhere(id) {
    try {
        for (const f of fs.readdirSync(BLOBS)) {
            const m = /^sf(\d+)(-2025)?\.json$/.exec(f);
            if (!m) continue;
            const it = findItem(Number(m[1]), id);
            if (it) return it;
        }
    } catch { /* ignore */ }
    return null;
}

// Star boxes (IsQuery drops) roll a real item of the target rarity that the buyer doesn't own yet
// (RecFlare's rollQueryDrop). The pool is every plain avatar-item drop in all storefront catalogs.
let pool = null;
function rollPool() {
    if (pool) return pool;
    pool = [];
    const seen = new Set();
    try {
        for (const f of fs.readdirSync(BLOBS)) {
            if (!/^sf\d+(-2025)?\.json$/.test(f)) continue;
            let d;
            try { d = JSON.parse(fs.readFileSync(path.join(BLOBS, f), "utf8")); } catch { continue; }
            for (const it of d.StoreItems || []) {
                const g = it.GiftDrop;
                if (!g || g.IsQuery || !g.AvatarItemDesc || seen.has(g.AvatarItemDesc)) continue;
                seen.add(g.AvatarItemDesc);
                pool.push(g);
            }
        }
    } catch { /* no blobs */ }
    console.log(`[BUY] roll pool: ${pool.length} items`);
    return pool;
}
function roll(acct, rarity) {
    const have = new Set(db.owned[acct] || []);
    const all = rollPool().filter((g) => g.Rarity === rarity);
    const fresh = all.filter((g) => !have.has(g.AvatarItemDesc));
    const from = fresh.length ? fresh : all; // owned everything of that rarity: allow repeats
    return from.length ? from[Math.floor(Math.random() * from.length)] : null;
}

// ---------- routes ----------
const json = express.json({ type: () => true, limit: "200kb" });
const form = express.urlencoded({ extended: true });

router.get("/api/storefronts/v4/balance/:currencyType", (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const cur = Number(req.params.currencyType) || TOKENS;
    const bal = balance(me, cur);
    console.log(`[WALLET] balance ${me} type=${cur}: ${bal}`);
    res.status(200).json([{ CurrencyType: cur, Platform: ALL, Balance: bal }]);
});

router.post("/api/storefronts/v2/buyItem", json, (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const type = Number(b.StorefrontType), pid = Number(b.PurchasableItemId);
    const cur = Number.isInteger(b.CurrencyType) ? b.CurrencyType : TOKENS;
    if (!Number.isInteger(pid)) return res.status(400).json({ error: "PurchasableItemId is required" });

    const item = findItem(type, pid) || findAnywhere(pid);
    if (!item) {
        console.log(`[BUY] ${me}: item ${pid} not found in storefront ${type}`);
        return res.status(404).json({ error: "Item not found" });
    }
    const price = (item.Prices || []).find((p) => p.CurrencyType === cur);
    if (!price) return res.status(400).json({ error: "Currency type not available for this item" });

    // The catalog price is charged. A Rec Room Plus player's game applies the member / sale discount
    // itself and posts the lower price, so for a Plus token a lower non-negative whole-number price is honoured.
    const asked = Number.isInteger(b.RequestedPrice) ? b.RequestedPrice : null;
    let charge = price.Price;
    if (asked !== null && asked >= 0 && asked < charge && tokenPlus(req)) charge = asked;
    const have = balance(me, cur);
    let drop = item.GiftDrop || {};
    if (have < charge) {
        console.log(`[BUY] ${me}: "${drop.FriendlyName}" costs ${charge}, has ${have} -> insufficient`);
        return res.status(400).json({ error: "Insufficient balance" });
    }
    db.w[me][cur] = have - charge;
    const boxName = drop.FriendlyName;
    if (drop.IsQuery) {
        const rolled = roll(me, drop.QueryRedirectRarity != null ? drop.QueryRedirectRarity : drop.Rarity);
        if (rolled) drop = rolled;
        else console.log(`[BUY] nothing to roll for "${boxName}"`);
    }
    if (drop.AvatarItemDesc) (db.owned[me] ||= []).includes(drop.AvatarItemDesc) || db.owned[me].push(drop.AvatarItemDesc);

    const gift = b.Gift && typeof b.Gift === "object" ? b.Gift : null;
    const receiver = gift && Number.isInteger(gift.ToPlayerId) ? gift.ToPlayerId : me;
    const from = gift && gift.Anonymous !== true ? me : 1;
    const message = gift && typeof gift.Message === "string" ? gift.Message : "";
    const ctx = gift && Number.isInteger(gift.GiftContext) ? gift.GiftContext : drop.Context || 0;
    let consId = 0, consPre = 0;
    if (drop.ConsumableItemDesc) {
        const list = (db.cons[receiver] ||= []);
        consPre = list.filter((c) => c.desc === drop.ConsumableItemDesc).reduce((n, c) => n + c.count, 0);
        consId = db.nextCons++;
        list.push({ id: consId, desc: drop.ConsumableItemDesc, count: 1, createdAt: new Date().toISOString() });
    }
    const id = db.nextGift++;
    const box = {
        Id: id,
        PlayerId: receiver,
        FromPlayerId: from,
        ConsumableItemDesc: drop.ConsumableItemDesc || "",
        ConsumableCount: drop.ConsumableItemDesc ? 1 : 0,
        ConsumableMappingId: consId,
        ConsumablePreExistingCount: consPre,
        AvatarItemDesc: drop.AvatarItemDesc || "",
        AvatarItemType: drop.AvatarItemType == null ? 0 : drop.AvatarItemType,
        CustomAvatarItemId: drop.CustomAvatarItemId || null,
        EquipmentPrefabName: drop.EquipmentPrefabName || "",
        EquipmentModificationGuid: drop.EquipmentModificationGuid || "",
        CurrencyType: drop.CurrencyType || 0,
        Currency: drop.Currency || 0,
        Xp: drop.Xp || 0,
        GiftContext: ctx,
        GiftRarity: drop.Rarity || 0,
        PackageType: 0,
        Message: message,
        Platform: ALL,
        PlatformsToSpawnOn: ALL,
        BalanceType: null,
    };
    (db.gifts[receiver] ||= []).push(box);
    persist();
    console.log(`[BUY] ${me} bought "${boxName}" (#${pid}) -> got "${drop.FriendlyName}" for ${charge} (asked ${b.RequestedPrice}); balance ${have} -> ${have - charge}`);

    res.status(200).json({
        BalanceUpdates: [{
            UpdateResponse: 0,
            Data: [{
                Id: id, FromPlayerId: from,
                ConsumableItemDesc: box.ConsumableItemDesc, AvatarItemDesc: box.AvatarItemDesc,
                AvatarItemType: box.AvatarItemType, EquipmentPrefabName: box.EquipmentPrefabName,
                EquipmentModificationGuid: box.EquipmentModificationGuid,
                CurrencyType: box.CurrencyType, Currency: box.Currency, Xp: box.Xp, Level: 0,
                Platform: ALL, PlatformsToSpawnOn: ALL, BalanceType: ALL,
                GiftContext: ctx, GiftRarity: box.GiftRarity, Message: message,
            }],
        }],
        Balance: -charge,
        CurrencyType: cur,
        BalanceType: ALL,
    });
});

// Consumables (RecFlare shapes): owned stacks grouped per item.
router.get("/api/consumables/v2/getUnlocked", (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const by = new Map();
    for (const c of db.cons[me] || []) {
        const g = by.get(c.desc);
        if (!g) by.set(c.desc, { Ids: [c.id], CreatedAts: [c.createdAt], ConsumableItemDesc: c.desc, Count: c.count, InitialCount: c.count, IsActive: false, ActiveDurationMinutes: 0, IsTransferable: false });
        else { g.Ids.push(c.id); g.CreatedAts.push(c.createdAt); g.Count += c.count; g.InitialCount += c.count; }
    }
    const out = [...by.values()];
    console.log(`[WALLET] consumables ${me}: ${out.length} kind(s)`);
    res.status(200).json(out);
});

router.post("/api/consumables/v1/consume", json, (req, res) => {
    const me = accountId(req);
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const cid = typeof b.Id === "number" ? b.Id : NaN;
    const delta = typeof b.DeltaCount === "number" ? b.DeltaCount : 1;
    if (me && !Number.isNaN(cid) && delta > 0) {
        const list = db.cons[me] || [];
        const row = list.find((c) => c.id === cid);
        if (row) {
            row.count -= delta;
            if (row.count <= 0) db.cons[me] = list.filter((c) => c !== row);
            persist();
            console.log(`[WALLET] ${me} used ${delta} of consumable #${cid}`);
        }
    }
    res.status(200).json({ error: "", success: true, value: null });
});

router.post("/api/consumables/v1/updateActive", json, (req, res) => res.status(200).end());

router.get("/api/avatar/v2/gifts", (req, res) => {
    const me = accountId(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const list = db.gifts[me] || [];
    console.log(`[WALLET] gifts ${me}: ${list.length} unopened`);
    res.status(200).json(list);
});

router.post("/api/avatar/v2/gifts/consume", form, json, (req, res) => {
    const me = accountId(req);
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const gid = Number(b.Id ?? b.id) || 0;
    if (me && gid && db.gifts[me]) {
        db.gifts[me] = db.gifts[me].filter((g) => g.Id !== gid);
        persist();
        console.log(`[WALLET] ${me} opened gift ${gid}`);
    }
    res.status(200).json({ error: "", success: true, value: null });
});

// ---------- terminal ----------
function command(line) {
    const [cmd, ...a] = line.trim().split(/\s+/);
    if (!cmd) return;
    console.log(`[CMD] > ${line.trim()}`);
    const num = (s) => (s !== undefined && /^-?\d+$/.test(s) ? Number(s) : null);
    const target = (s) => (num(s) > 0 ? Number(s) : db.me);
    const c = cmd.toLowerCase();
    if (c === "give" || c === "take" || c === "set") {
        const n = num(a[0]);
        if (n === null || n < 0) return console.log(`[CMD] usage: ${c} <amount> [accountId]`);
        const t = target(a[1]);
        const old = balance(t, TOKENS);
        setBalance(t, TOKENS, c === "give" ? old + n : c === "take" ? old - n : n);
        console.log(`[CMD] account ${t}: ${old} -> ${db.w[t][TOKENS]} tokens`);
    } else if (c === "balance" || c === "bal") {
        const t = target(a[0]);
        console.log(`[CMD] account ${t}: ${balance(t, TOKENS)} tokens`);
    } else if (c === "me") {
        const n = num(a[0]);
        if (!n || n <= 0) return console.log(`[CMD] "me" is account ${db.me}. usage: me <accountId>`);
        db.me = n; persist();
        console.log(`[CMD] "me" is now account ${db.me}`);
    } else if (c === "wallets") {
        for (const k of Object.keys(db.w)) console.log(`[CMD]   ${k}: ${db.w[k][TOKENS] ?? 0} tokens`);
        if (!Object.keys(db.w).length) console.log("[CMD]   (none yet)");
    } else if (c === "help" || c === "?") {
        console.log("[CMD] give|take|set <amount> [accountId] | balance [accountId] | me <accountId> | wallets | help");
    } else {
        console.log(`[CMD] unknown command "${cmd}" (type help)`);
    }
}

if (process.env.WALLET_TERMINAL !== "0" && process.stdin) {
    try {
        const rl = require("readline").createInterface({ input: process.stdin, terminal: false });
        rl.on("line", (l) => { try { command(l); } catch (e) { console.log(`[CMD] error: ${e.message}`); } });
        rl.on("error", () => {});
        console.log(`[CMD] terminal ready - type "help". "me" = account ${db.me}`);
    } catch { /* no stdin */ }
}

// a plain gift box with tokens in it (used by the Friend-O-Tron: POST /api/freegifts/v1/sendmultiple)
function giveTokenGift(receiver, from, tokens, message, ctx) {
    const id = db.nextGift++;
    (db.gifts[receiver] ||= []).push({ Id: id, PlayerId: receiver, FromPlayerId: from, ConsumableItemDesc: "", ConsumableCount: 0, ConsumableMappingId: 0, ConsumablePreExistingCount: 0,
        AvatarItemDesc: "", AvatarItemType: 0, CustomAvatarItemId: null, EquipmentPrefabName: "", EquipmentModificationGuid: "", CurrencyType: TOKENS, Currency: tokens, Xp: 0,
        GiftContext: ctx, GiftRarity: 0, PackageType: 0, Message: message || null, Platform: ALL, PlatformsToSpawnOn: ALL, BalanceType: null });
    persist(); return id;
}

module.exports = { router, balance, setBalance, command, giveTokenGift };