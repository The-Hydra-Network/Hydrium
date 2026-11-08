// Correzioni per il client 20231207: risposte nel formato che il gioco accetta.
// Montato in index.js PRIMA degli altri router, quindi queste rotte vincono.
// Formati presi da RecFlare, che con questo client funziona.
const express = require("express");

const router = express.Router();

// ---------------------------------------------------------
// Keepsakes
// ---------------------------------------------------------
// Prima il server rispondeva con nomi di campo offuscati (FOIGKMGEPJE...)
// e il client restava per sempre su "Waiting for Keepsake Instance Data
// download..." durante il caricamento della stanza (schermo nero).

router.get("/api/keepsakes/globalconfig", (req, res) => {
    console.log("[FIX] keepsakes/globalconfig");
    return res.status(200).json({
        KeepsakeFeatureEnabled: true,
        KeepsakeRoomLimit: 10,
        SocialXpBoostEnabled: false
    });
});

// Un oggetto { Results, TotalResults }, MAI un array nudo.
router.get("/api/keepsakes/categories", (req, res) => {
    console.log("[FIX] keepsakes/categories");
    return res.status(200).json({ Results: [], TotalResults: 0 });
});

// Nessun keepsake salvato: 204 senza corpo (un corpo qui e' trattato come dati).
router.get("/api/keepsakes/rooms/:roomId", (req, res) => {
    console.log(`[FIX] keepsakes/rooms/${req.params.roomId}`);
    return res.status(204).end();
});

// ---------------------------------------------------------
// Risposte che il client leggeva come "Malformed Response"
// ---------------------------------------------------------

// Era {} -> "Malformed Response: '{}'"
router.post("/statsigUserProperties", (req, res) => {
    return res.status(200).json({ success: true });
});

// Era [] ma il client si aspetta un oggetto (la sfida settimanale).
// Nessuna sfida attiva: Challenges vuoto.
router.get("/api/challenge/v2/getCurrent", (req, res) => {
    const WEEK_MS = 7 * 24 * 3600 * 1000;
    const start = Date.now() - (Date.now() % WEEK_MS);
    const iso = (t) => new Date(t).toISOString().slice(0, 19);
    const now = new Date();
    return res.status(200).json({
        ChallengeMapId: 1,
        CompletedRequired: false,
        StartAt: iso(start),
        EndAt: iso(start + WEEK_MS),
        ServerTime: `${now.toISOString().slice(0, -1)}0000Z`,
        Challenges: [],
        Gift: {
            GiftDropId: 0,
            AvatarItemDesc: "",
            AvatarItemType: 0,
            ConsumableItemDesc: "",
            EquipmentPrefabName: "",
            EquipmentModificationGuid: "",
            StorefrontType: 0,
            Xp: 0,
            Level: 0,
            GiftContext: 0,
            GiftRarity: 0
        },
        FallbackGiftName: "",
        ChallengeThemeString: ""
    });
});

// Era [] -> il client si aspetta una voce per la valuta richiesta.
// (balance route removed - served by hydrium-econ-buy.js)

module.exports = router;
