const express = require("express");

const router = express.Router();


// =========================================================
// HYDRIUM CHAT SERVICE
// =========================================================
//
// HTTP routes used by the 20231207 client will be added
// here as they are observed.
//
// Photon Chat is separate from this HTTP service.
// =========================================================

router.use((req, res, next) => {

    console.log(
        `[CHAT] ${req.method} ${req.originalUrl}`
    );

    next();
});

// ---------------------------------------------------------
// GET /thread
// ---------------------------------------------------------
//
// Observado:
// GET /thread?maxCount=50&mode=0
//
// Estrutura real da resposta ainda não confirmada.
// Resposta mínima temporária para teste.
//

router.get("/thread", (req, res) => {
    const maxCount = req.query.maxCount;
    const mode = req.query.mode;

    console.log(
        `[CHAT] Thread list requested - maxCount=${maxCount}, mode=${mode}`
    );

    return res.status(200).json([]);;
});

// ---------------------------------------------------------
// GET /thread/party
// ---------------------------------------------------------
//
// Observado:
// GET /thread/party?maxCount=1&mode=0
//
// Formato real ainda não confirmado.
// Resposta mínima temporária para observar o cliente.
//

router.get("/thread/party", (req, res) => {
    const maxCount = req.query.maxCount;
    const mode = req.query.mode;

    console.log(
        `[CHAT] Party thread requested - maxCount=${maxCount}, mode=${mode}`
    );

    return res.status(200).json([]);
});

// ---------------------------------------------------------
// GET /announcements/v2/mine/unread
// ---------------------------------------------------------
//
// Observado diretamente no cliente.
// Formato real da resposta ainda não confirmado.
//

router.get("/announcements/v2/mine/unread", (req, res) => {
    console.log("[CHAT] Unread announcements requested");

    return res.status(200).json([]);
});

// =========================================================
// Voice / ToxMod — Rec Room PC 20231207
// Reconstructed from GameAssembly.dll + global-metadata.dat
// =========================================================


// ---------------------------------------------------------
// GET /voice/config
//
// Response DTO:
//   EJPAKPOGABM
//
// Wire properties:
//   ApiKey    : string
//   AccountId : string
//
// IMPORTANT:
// AccountId aqui pertence à configuração do ToxMod.
// NÃO é o AccountId do jogador do Rec Room.
// Portanto NÃO deve mudar de jogador para jogador.
// ---------------------------------------------------------

router.get("/voice/config", (req, res) => {
    console.log("[VOICE] Config requested");

    return res
        .status(200)
        .type("application/json")
        .json({
            ApiKey: "HYDRIUM_TEST",
            AccountId: "HYDRIUM_TEST"
        });
});


// ---------------------------------------------------------
// GET /voice/requiresModeration
//
// Query:
//   roomId
//   subroomId
//   roomInstanceId
//
// Response:
//   System.Boolean
//
// JSON wire representation:
//   true
//   false
// ---------------------------------------------------------

router.get("/voice/requiresModeration", (req, res) => {
    const roomId = Number(req.query.roomId);
    const subroomId = Number(req.query.subroomId);
    const roomInstanceId = Number(req.query.roomInstanceId);

    console.log("[VOICE] Requires moderation", {
        roomId,
        subroomId,
        roomInstanceId
    });

    return res
        .status(200)
        .type("application/json")
        .send("false");
});

module.exports = router;