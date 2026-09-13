const express = require("express");
const router = express.Router();

const {
    success
} = require("../utils/response");

const {
    log
} = require("../utils/logger");


// GET /
// Basic API status
router.get(
["/", "/v1/status", "/status"],
(req,res)=>
{
    log(
        "api",
        "Status check"
    );


    return success(res,
    {
        status:"online",

        version:"2023.05.01",

        serverTime:
            new Date().toISOString(),

        allowedPlayers:
            999999,

        motd:
            "Welcome to RR-Revived"
    });
});




// GET /v1/config
// Client startup configuration
router.get(
"/v1/config",
(req,res)=>
{
    log(
        "api",
        "Config request"
    );


    return success(res,
    {
        server:
        {
            name:"RR-Revived",

            version:"0.1.0"
        },


        services:
        {
            auth:
                "https://auth.rec.net",

            accounts:
                "https://accounts.rec.net",

            rooms:
                "https://rooms.rec.net",

            match:
                "https://match.rec.net"
        },


        maintenance:
            false
    });
});




// GET /v1/time
router.get(
"/v1/time",
(req,res)=>
{
    return success(res,
    {
        serverTime:
            new Date().toISOString(),

        timestamp:
            Date.now()
    });
});




// GET /v1/version
router.get(
"/v1/version",
(req,res)=>
{
    return success(res,
    {
        version:
            "2023.05.01"
    });
});




// POST /v1/events
router.post(
"/v1/events",
(req,res)=>
{
    log(
        "api",
        "Event received",
        req.body
    );


    return success(res,
    {
        logged:true
    });
});




// POST /v1/errors
router.post(
"/v1/errors",
(req,res)=>
{
    log(
        "api",
        "Client error",
        req.body
    );


    return success(res,
    {
        received:true
    });
});


module.exports = router;