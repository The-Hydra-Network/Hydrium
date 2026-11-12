const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/auth');
const { success, error, paginated } = require('../utils/response');
const { log } = require('../utils/logger');

const { v4: uuidv4 } = require('uuid');


// Temporary room database
// Later this moves to rooms.json/database
const rooms = [
    {
        roomId: "room-001",
        name: "Rec Center",
        description: "RR-Revived main hub",

        creatorId: "system",
        creatorName: "RR-Revived",

        isPrivate: false,

        maxPlayers: 40,
        currentPlayers: 0,

        category: "hub",

        tags: [
            "social",
            "hub"
        ],

        thumbnail: "/thumbnails/reccenter.png",

        instances: []
    }
];


// GET /
// Room discovery
router.get("/", verifyToken, (req, res) =>
{
    const {
        category,
        search,
        page = 1,
        limit = 20
    } = req.query;


    log(
        "rooms",
        "Room search",
        {
            user:req.user.sub,
            category,
            search
        }
    );


    let result = [...rooms];


    if(category)
    {
        result = result.filter(
            room => room.category === category
        );
    }


    if(search)
    {
        result = result.filter(
            room =>
            room.name
            .toLowerCase()
            .includes(
                search.toLowerCase()
            )
        );
    }


    return paginated(
        res,
        result,
        result.length,
        Number(page),
        Number(limit)
    );
});



// GET /featured
router.get("/featured", verifyToken, (req,res)=>
{
    return success(res,
    {
        rooms: rooms.slice(0,3)
    });
});



// GET /:roomId
router.get("/:roomId", verifyToken, (req,res)=>
{
    const room = rooms.find(
        r => r.roomId === req.params.roomId
    );


    if(!room)
    {
        return error(
            res,
            "Room not found",
            404
        );
    }


    return success(res,
    {
        room
    });
});



// POST /:roomId/join
// Creates or joins a room instance
router.post("/:roomId/join", verifyToken, (req,res)=>
{
    const room = rooms.find(
        r => r.roomId === req.params.roomId
    );


    if(!room)
    {
        return error(
            res,
            "Room not found",
            404
        );
    }


    let instance = room.instances[0];


    if(!instance)
    {
        instance =
        {
            instanceId: uuidv4(),

            roomId: room.roomId,

            photonRoomName:
                `rr_${room.roomId}`,

            server:
                "127.0.0.1",

            port:
                5055,

            players: []
        };


        room.instances.push(instance);
    }


    if(!instance.players.includes(req.user.sub))
    {
        instance.players.push(req.user.sub);
    }


    room.currentPlayers =
        instance.players.length;


    log(
        "rooms",
        "Player joined room",
        {
            user:req.user.sub,
            room:room.roomId
        }
    );


    return success(res,
    {
        roomId:room.roomId,

        instance
    });
});



// GET /:roomId/instances
router.get("/:roomId/instances", verifyToken, (req,res)=>
{
    const room = rooms.find(
        r => r.roomId === req.params.roomId
    );


    if(!room)
    {
        return error(
            res,
            "Room not found",
            404
        );
    }


    return success(res,
    {
        instances:
            room.instances
    });
});



// POST /create
// Create a new room
router.post("/create", verifyToken, (req,res)=>
{
    const room =
    {
        roomId:
            uuidv4(),

        name:
            req.body.name || "Untitled Room",

        description:
            req.body.description || "",

        creatorId:
            req.user.sub,

        creatorName:
            req.user.username,

        isPrivate:
            false,

        maxPlayers:
            16,

        currentPlayers:
            0,

        category:
            "custom",

        tags:
            [],

        instances:[]
    };


    rooms.push(room);


    log(
        "rooms",
        "Room created",
        room
    );


    return success(
        res,
        {
            room
        },
        201
    );
});


module.exports = router;