const express = require("express");
const router = express.Router();

const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

const {
    generateToken
} = require("../middleware/auth");

const {
    success,
    error
} = require("../utils/response");
console.log("RESPONSE DEBUG:", {
    successType: typeof success,
    errorType: typeof error
});

const {
    log
} = require("../utils/logger");

const users = require("../data/users.json");


// Temporary refresh token storage
// Replace with database later
const refreshTokens = [];



// POST /login
router.post("/login", async (req, res) =>
{
    const {
        username,
        password,
        platform
    } = req.body;


    log(
        "auth",
        "Login attempt",
        {
            username,
            platform
        }
    );


    const user = users.find(
        u =>
            u.username === username
    );


    if (!user)
    {
        return error(
            res,
            "Invalid username or password",
            401
        );
    }



    // Password verification
    // Disabled if passwordHash is empty
    if (
        user.passwordHash &&
        user.passwordHash.length > 0
    )
    {
        const valid =
            await bcrypt.compare(
                password,
                user.passwordHash
            );


        if (!valid)
        {
            return error(
                res,
                "Invalid username or password",
                401
            );
        }
    }



    const sessionToken =
        generateToken(user);


    const refreshToken =
        uuidv4();


    refreshTokens.push(
    {
        token: refreshToken,
        userId: user.userId
    });



    user.lastLogin =
        new Date().toISOString();



    return success(
        res,
        {
            userId:user.userId,

            username:user.username,

            displayName:
                user.displayName,

            sessionToken,

            refreshToken,

            expiresIn:86400
        }
    );
});





// POST /register
router.post("/register", async (req,res) =>
{
    const {
        username,
        password,
        email
    } = req.body;



    const exists =
        users.find(
            u =>
                u.username === username
        );


    if (exists)
    {
        return error(
            res,
            "Username already exists",
            409
        );
    }



    const passwordHash =
        password
        ?
        await bcrypt.hash(
            password,
            10
        )
        :
        "";



    const user =
    {
        userId:
            uuidv4(),

        username,

        displayName:
            username,

        email,

        passwordHash,


        createdAt:
            new Date().toISOString(),

        lastLogin:null,


        status:"active",


        level:1,

        xp:0,


        currency:
        {
            tokens:0,
            gold:0
        },


        inventory:[],


        profile:
        {
            avatarId:"default",
            bio:"",
            platforms:[]
        },


        friends:[],


        roomsCreated:[],


        roomsVisited:[],


        permissions:
        [
            "user"
        ],


        sessions:[]
    };



    users.push(user);



    const sessionToken =
        generateToken(user);



    const refreshToken =
        uuidv4();



    refreshTokens.push(
    {
        token:refreshToken,
        userId:user.userId
    });



    return success(
        res,
        {
            userId:user.userId,

            username:user.username,

            displayName:user.displayName,

            sessionToken,

            refreshToken,

            expiresIn:86400
        },
        201
    );
});





// POST /token/refresh
router.post(
"/token/refresh",
(req,res)=>
{
    const {
        refreshToken
    } = req.body;



    const session =
        refreshTokens.find(
            s =>
                s.token === refreshToken
        );



    if (!session)
    {
        return error(
            res,
            "Invalid refresh token",
            401
        );
    }



    const user =
        users.find(
            u =>
                u.userId === session.userId
        );



    if (!user)
    {
        return error(
            res,
            "User not found",
            404
        );
    }



    const newToken =
        generateToken(user);



    return success(
        res,
        {
            sessionToken:newToken,

            refreshToken,

            expiresIn:86400
        }
    );
});





// POST /logout
router.post(
"/logout",
(req,res)=>
{
    return success(
        res,
        {
            message:
                "Logged out successfully"
        }
    );
});





// GET /validate
router.get(
"/validate",
(req,res)=>
{
    return success(
        res,
        {
            valid:true
        }
    );
});





module.exports = router;