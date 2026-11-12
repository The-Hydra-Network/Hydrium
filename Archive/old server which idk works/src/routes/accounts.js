const express = require("express");
const router = express.Router();

const {
    verifyToken
} = require("../middleware/auth");

const {
    success,
    error
} = require("../utils/response");

const {
    log
} = require("../utils/logger");


const users = require("../data/users.json");



// GET /profile
router.get(
"/profile",
verifyToken,
(req,res)=>
{
    const user =
        users.find(
            u =>
            u.userId === req.user.sub
        );


    if(!user)
    {
        return error(
            res,
            "User not found",
            404
        );
    }


    log(
        "accounts",
        "Get profile",
        {
            userId:user.userId
        }
    );


    return success(res,
    {
        userId:
            user.userId,

        username:
            user.username,

        displayName:
            user.displayName,


        createdAt:
            user.createdAt,


        level:
            user.level,


        xp:
            user.xp,


        currency:
            user.currency,


        avatar:
        {
            avatarId:
                user.profile.avatarId
        },


        bio:
            user.profile.bio,


        friends:
            user.friends,


        stats:
        {
            roomsCreated:
                user.roomsCreated.length,

            roomsVisited:
                user.roomsVisited.length,

            friendsCount:
                user.friends.length
        }
    });
});




// PUT /profile
router.put(
"/profile",
verifyToken,
(req,res)=>
{
    const user =
        users.find(
            u =>
            u.userId === req.user.sub
        );


    if(!user)
    {
        return error(
            res,
            "User not found",
            404
        );
    }


    const {
        displayName,
        bio,
        avatarId
    } = req.body;



    if(displayName)
    {
        user.displayName =
            displayName;
    }


    if(bio)
    {
        user.profile.bio =
            bio;
    }


    if(avatarId)
    {
        user.profile.avatarId =
            avatarId;
    }


    log(
        "accounts",
        "Profile updated",
        {
            userId:user.userId
        }
    );


    return success(res,
    {
        updated:true
    });
});




// GET /:userId
// Public profile lookup
router.get(
"/:userId",
verifyToken,
(req,res)=>
{
    const user =
        users.find(
            u =>
            u.userId === req.params.userId
        );


    if(!user)
    {
        return error(
            res,
            "User not found",
            404
        );
    }


    return success(res,
    {
        userId:
            user.userId,

        username:
            user.username,

        displayName:
            user.displayName,

        level:
            user.level,

        avatar:
        {
            avatarId:
                user.profile.avatarId
        },

        bio:
            user.profile.bio
    });
});



module.exports = router;