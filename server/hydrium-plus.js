"use strict";

// Hydrium - Rec Room Plus.
//
// RecFlare: Plus is a flag on the account, carried in the login token as `rn.plus: true`.
// POST /api/CampusCard/v1/UpdateAndGetSubscription answers an active Gold yearly
// subscription for a token that has it, and "not subscribed" otherwise.
//
// Who has Plus here:
//   - any account with a special role in PocketBase (developer, moderator, ...), or
//   - the ids in env HYDRIUM_PLUS (comma separated), or everyone with HYDRIUM_PLUS=all
//
// Install:
//   1. app.use(require("./hydrium-plus").router);      // before app.use(auth)
//   2. node apply-plus.js                            // adds "rn.plus" to the login token in auth.js
//   3. restart the server AND sign in again (the token only changes at login)

const express = require("express");
const jwt = require("jsonwebtoken");
const pb = require("./pb");
const { parseRoles } = require("./hydrium-roles");

const router = express.Router();
const LIST = String(process.env.HYDRIUM_PLUS || "").toLowerCase().split(/[,\s]+/).filter(Boolean);

function isPlus(account) {
    if (!account) return false;
    if (LIST.includes("all")) return true;
    if (LIST.includes(String(account.accountId))) return true;
    return parseRoles(account.role).length > 0;
}

function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        const d = jwt.verify(h.slice(7), process.env.HYDRIUM_JWT_SECRET);
        return { id: Number(d.sub), plus: d["rn.plus"] === true };
    } catch { return null; }
}

function subscription(id) {
    const now = new Date();
    const exp = new Date(now);
    exp.setUTCFullYear(exp.getUTCFullYear() + 1);
    return {
        SubscriptionId: 1,
        RecNetPlayerId: id,
        PlatformType: -1,
        PlatformId: "",
        PlatformPurchaseId: "",
        Level: 0,
        Period: 1,
        ExpirationDate: exp.toISOString(),
        IsAutoRenewing: true,
        CreatedAt: now.toISOString(),
        ModifiedAt: now.toISOString(),
    };
}

router.post("/api/CampusCard/v1/UpdateAndGetSubscription", async (req, res) => {
    const who = accountId(req);
    let plus = false;
    if (who && Number.isSafeInteger(who.id)) {
        plus = who.plus;
        if (!plus) {
            try {
                plus = isPlus(await pb.collection("hydrium_accounts").getFirstListItem(`accountId = ${who.id}`));
            } catch { /* unknown account */ }
        }
    }
    console.log(`[PLUS] subscription ${who ? who.id : "?"}: ${plus ? "active" : "none"}`);
    // The 20231207 client reads "not subscribed" as a bare false (see api.js).
    if (!plus) return res.status(200).json(false);
    res.status(200).json({ Subscription: subscription(who.id), PlatformAccountSubscribedPlayerId: null });
});

module.exports = { router, isPlus };
