const express = require("express");
const router = express.Router();

const {
    verifyToken
} = require("../middleware/auth");

const {
    success
} = require("../utils/response");

const {
    log
} = require("../utils/logger");



// Health check
router.get(
"/health",
(req,res)=>
{
    return success(res,
    {
        gateway:"healthy",

        uptime:
            process.uptime()
    });
});




// Gateway status
router.get(
["/","/v1/status"],
(req,res)=>
{
    log(
        "apim",
        "Gateway status"
    );


    return success(res,
    {
        gateway:true,

        status:"online",

        service:
            "RR-Revived API Gateway"
    });
});




// Authenticated gateway routes
router.all(
"/v1/*",
verifyToken,
(req,res)=>
{
    log(
        "apim",
        "Gateway request",
        {
            method:req.method,

            path:req.path,

            user:req.user.sub
        }
    );


    return success(res,
    {
        gateway:true,

        forwarded:true,

        path:req.path,

        backend:
            "RR-Revived-internal"
    });
});



module.exports = router;