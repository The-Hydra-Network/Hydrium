const express = require("express");

const router = express.Router();

// =========================================================
// Temporary compatibility endpoints for build 20231207
//
// IMPORTANT:
// - Only contracts supported by current client/binary evidence were
//   corrected here.
// - Unknown DTO fields are intentionally NOT fabricated.
// - Endpoints whose exact contract is still unconfirmed keep their
//   previous compatibility response.
// =========================================================

// POST /api/sanitize/v1
router.post("/api/sanitize/v1", (req, res) => {
    console.log("[COMPAT] Text sanitization requested");

    return res.status(200).json({
        Value: String(req.body?.Value ?? ""),
        Replacements: [],
        WasModified: false
    });
});

// GET /api/incentivizedreferrals/progress
router.get("/api/incentivizedreferrals/progress", (req, res) => {
    console.log("[COMPAT] Referral progress requested");

    return res.status(200).json({
        ReferralCode: null,
        ReferralCount: 0,
        RewardProgress: []
    });
});

// POST /api/externalfriendinvite/v1/getplatformreferrers
router.post("/api/externalfriendinvite/v1/getplatformreferrers", (req, res) => {
    console.log("[COMPAT] Platform referrers requested");
    return res.status(200).json([]);
});

// POST /api/messages/v1/friendOnlineStatus
router.post("/api/messages/v1/friendOnlineStatus", (req, res) => {
    console.log("[COMPAT] Friend online status requested");

    return res.status(200).json({
        FriendOnlineStatuses: [],
        OnlineFriendIds: [],
        Results: []
    });
});

// =========================================================
// Keepsakes
// =========================================================

// GET /api/keepsakes/globalconfig
router.get("/api/keepsakes/globalconfig", (req, res) => {
    console.log("[COMPAT] Keepsakes global config requested");

    // KeepsakeGlobalConfigDTO (0x02000B84)
    // Recovered property order/types:
    // bool, int32, bool
    return res.status(200).json({
        DPLJPDAPBGM: false,
        FJCGHPJOIEF: 0,
        FCFFPNHJDKG: false
    });
});

// GET /api/keepsakes/categories
router.get("/api/keepsakes/categories", (req, res) => {
    console.log("[COMPAT] Keepsake categories requested");

    // KeepsakeCategoryConfigDTO (0x02000B83)
    // Recovered property order/types:
    // enum, string, int32, int32, string, string
    return res.status(200).json({
        FOIGKMGEPJE: 0,
        NFNBHFKEGAA: "",
        JEGFJAOCCBG: 0,
        DPDFFFBMCJF: 0,
        FGFOEEOHMAE: "",
        CIDLKELAFNF: ""
    });
});

// GET /api/keepsakes/rooms/:roomId
router.get("/api/keepsakes/rooms/:roomId", (req, res) => {
    const roomId = Number(req.params.roomId);

    console.log(
        `[COMPAT] Room keepsakes requested - roomId=${roomId}`
    );

    return res.status(200).json({
        Keepsakes: [],
        ContinuationToken: null
    });
});

// GET /api/roomkeys/v1/room?roomId=...
router.get("/api/roomkeys/v1/room", (req, res) => {
    const roomId = Number(req.query.roomId);

    console.log(
        `[COMPAT] Room keys requested - roomId=${roomId}`
    );

    return res.status(200).json([]);
});

// GET /econ/roomOffer/room/:roomId/purchaseCounts
router.get("/econ/roomOffer/room/:roomId/purchaseCounts", (req, res) => {
    const roomId = Number(req.params.roomId);

    console.log(
        `[COMPAT] Room offer purchase counts requested - roomId=${roomId}`
    );

    return res.status(200).json({
        PurchaseCounts: [],
        Results: []
    });
});

// GET /rooms/:roomId/playerdata/me
router.get("/rooms/:roomId/playerdata/me", (req, res) => {
    const roomId = Number(req.params.roomId);

    console.log(
        `[COMPAT] Room player data requested - roomId=${roomId}`
    );

    return res.status(200).json({
        RoomId: roomId,
        DataBlob: ""
    });
});

// GET /rooms/:roomId/experience/player
router.get("/rooms/:roomId/experience/player", (req, res) => {
    const roomId = Number(req.params.roomId);

    console.log(
        `[COMPAT] Room experience requested - roomId=${roomId}`
    );

    return res.status(200).json({
        RoomId: roomId,
        Level: 0,
        XP: 0
    });
});

// GET /subscription/details/:accountId
router.get("/subscription/details/:accountId", (req, res) => {
    const accountId = Number(req.params.accountId);

    console.log(
        `[COMPAT] Subscription details requested - accountId=${accountId}`
    );

    return res.status(200).json({
        AccountId: accountId,
        IsActive: false,
        SubscriptionType: 0,
        ExpirationDate: null
    });
});

// =========================================================
// Compatibility endpoints - second batch
// =========================================================

router.get("/rooms/visitedby/me", (req, res) => {
    console.log("[COMPAT] Visited rooms requested");
    return res.status(200).json([]);
});

router.get("/rooms/favoritedby/me", (req, res) => {
    console.log("[COMPAT] Favorited rooms requested");
    return res.status(200).json([]);
});

router.get("/rooms/ownedby/:accountId", (req, res) => {
    const accountId = Number(req.params.accountId);

    console.log(
        `[COMPAT] Owned rooms requested - accountId=${accountId}`
    );

    return res.status(200).json([]);
});

router.get("/clubhousesearch/mostactivenow", (req, res) => {
    console.log("[COMPAT] Most-active clubhouses requested");
    return res.status(200).json([]);
});

router.get("/club/categoryTags", (req, res) => {
    console.log("[COMPAT] Club category tags requested");
    return res.status(200).json([]);
});

router.get("/api/rooms/v1/filters", (req, res) => {
    console.log("[COMPAT] Room filters requested");
    return res.status(200).json([]);
});

router.get("/api/progressionEvents/active", (req, res) => {
    console.log("[COMPAT] Active progression events requested");
    return res.status(200).json([]);
});

router.get("/api/inventions/v2/mine", (req, res) => {
    console.log("[COMPAT] My inventions requested");
    return res.status(200).json([]);
});

router.get("/api/customAvatarItems/v2/fromCreator/:accountId", (req, res) => {
    const accountId = Number(req.params.accountId);

    console.log(
        `[COMPAT] Creator avatar items requested - accountId=${accountId}`
    );

    return res.status(200).json([]);
});

router.get("/api/images/v5/player/:accountId", (req, res) => {
    const accountId = Number(req.params.accountId);

    console.log(
        `[COMPAT] Player images requested - accountId=${accountId}`
    );

    return res.status(200).json({
        Results: [],
        TotalResults: 0
    });
});

router.get("/account/:accountId/bio", (req, res) => {
    const accountId = Number(req.params.accountId);

    console.log(
        `[COMPAT] Account bio requested - accountId=${accountId}`
    );

    return res.status(200).json({
        AccountId: accountId,
        Bio: ""
    });
});

router.get("/api/influencerpartnerprogram/influencer", (req, res) => {
    const accountId = Number(req.query.accountId);

    console.log(
        `[COMPAT] Influencer requested - accountId=${accountId}`
    );

    return res.status(200).json({
        AccountId: accountId,
        IsInfluencer: false
    });
});

router.get("/api/influencerpartnerprogram/myinfluencer", (req, res) => {
    console.log("[COMPAT] My influencer requested");

    return res.status(200).json({
        AccountId: 0,
        IsInfluencer: false
    });
});

router.get("/config/categories", (req, res) => {
    console.log("[COMPAT] Categories config requested");
    return res.status(200).json([]);
});

router.get("/preferences", (req, res) => {
    console.log("[COMPAT] Notification preferences requested");

    return res.status(200).json({
        Preferences: []
    });
});

router.post("/pageview/consume", (req, res) => {
    console.log("[COMPAT] Page view consumed");

    return res.status(200).json({
        Success: true
    });
});

module.exports = router;