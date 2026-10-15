const express = require("express");

const router = express.Router();

// ---------------------------------------------------------
// GET /club/mine/member
// ---------------------------------------------------------
//
// Endpoint observado diretamente no cliente.
// O formato real da resposta ainda precisa ser determinado.
// Por enquanto retornamos um objeto vazio para avançar o teste.
//
// EN

router.get("/club/mine/member", (req, res) => {
    console.log("[CLUB] GET /club/mine/member");

    return res
        .status(200)
        .json([]);
});

// ---------------------------------------------------------
// GET /club/home/me
// ---------------------------------------------------------
//
// Observado diretamente no cliente.
// Estrutura da resposta ainda não confirmada.
//

router.get("/club/home/me", (req, res) => {
    console.log("[CLUB] GET /club/home/me - no home club");
    return res.sendStatus(404);
});

router.get(
    "/announcements/v2/subscription/mine/unread",
    (req, res) => {
        const sendAnnouncements =
            req.query.sendAnnouncements === "true";

        console.log(
            `[CLUB] Unread subscription announcements requested - sendAnnouncements=${sendAnnouncements}`
        );

        return res.status(200).json([]);
    }
);

// =========================================================
// GET /subscription/mine/member
// =========================================================

router.get(
    "/subscription/mine/member",
    (req, res) => {
        console.log(
            "[CLUB] Subscription memberships requested"
        );

        // O cliente espera uma lista.
        return res
            .status(200)
            .json([]);
    }
);

module.exports = router;