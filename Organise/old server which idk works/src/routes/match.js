const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const { success, error } = require("../utils/response");
const { log } = require("../utils/logger");


// Temporary active matches
// Later this will come from roomService/database
const matches = [];


// POST /
// Find or create a match
router.post("/", verifyToken, (req, res) =>
{
    const {
        roomId,
        region = "local",
        gameMode = "social"
    } = req.body;


    log(
        "match",
        "Find match",
        {
            user:req.user.sub,
            roomId,
            region,
            gameMode
        }
    );


    let match = matches.find(
        m =>
        m.roomId === roomId &&
        m.region === region
    );


    if(!match)
    {
        match =
        {
            instanceId:
                `inst-${Date.now()}`,

            roomId:
                roomId || "room-001",

            region,

            gameMode,


            photon:
            {
                roomName:
                    `rr_${roomId || "default"}`,

                appId:
                    "RR-Revived-photon-app",

                endpoint:
                    "127.0.0.1:5055"
            },


            players:
            [
                req.user.sub
            ],


            maxPlayers:
                16
        };


        matches.push(match);
    }
    else
    {
        if(
            !match.players.includes(
                req.user.sub
            )
        )
        {
            match.players.push(
                req.user.sub
            );
        }
    }


    return success(res,
    {
        matchFound:true,

        instanceId:
            match.instanceId,

        photonRoomName:
            match.photon.roomName,

        photonAppId:
            match.photon.appId,

        endpoint:
            match.photon.endpoint,

        region:
            match.region,

        players:
            match.players,

        maxPlayers:
            match.maxPlayers
    });
});



// POST /join
router.post("/join", verifyToken, (req,res)=>
{
    const {
        instanceId
    } = req.body;


    log(
        "match",
        "Join instance",
        {
            user:req.user.sub,
            instanceId
        }
    );


    const match = matches.find(
        m =>
        m.instanceId === instanceId
    );


    if(!match)
    {
        return error(
            res,
            "Match instance not found",
            404
        );
    }


    if(
        !match.players.includes(
            req.user.sub
        )
    )
    {
        match.players.push(
            req.user.sub
        );
    }


    return success(res,
    {
        joined:true,

        instanceId:
            match.instanceId,

        photonRoomName:
            match.photon.roomName,

        photonAppId:
            match.photon.appId,

        endpoint:
            match.photon.endpoint
    });
});



// POST /leave
router.post("/leave", verifyToken, (req,res)=>
{
    const {
        instanceId
    } = req.body;


    const match = matches.find(
        m =>
        m.instanceId === instanceId
    );


    if(match)
    {
        match.players =
            match.players.filter(
                id =>
                id !== req.user.sub
            );
    }


    log(
        "match",
        "Leave match",
        {
            user:req.user.sub,
            instanceId
        }
    );


    return success(res,
    {
        left:true
    });
});


module.exports = router;