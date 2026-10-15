const express = require("express");

const router = express.Router();

// GET /strings?locale=pt-BR&scopePrefix=client.&eTag=20231207

router.get("/strings", (req, res) => {
    console.log(
        `[STRINGS] locale=${req.query.locale} scopePrefix=${req.query.scopePrefix} eTag=${req.query.eTag}`
    );

    return res.status(200).json({});
});

module.exports = router;