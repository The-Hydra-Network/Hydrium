const jwt = require("jsonwebtoken");
const { error } = require("../utils/response");

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "RR-Revived-development-secret";


function generateToken(user)
{
    return jwt.sign(
{
    sub:user.userId,
    username:user.username,
    displayName:user.displayName,
    role:user.permissions?.[0] || "user"
},
JWT_SECRET,
{
    expiresIn:"24h",
    issuer:"RR-Revived"
});
}


function verifyToken(req, res, next)
{
    let token = null;

    const authHeader = req.headers.authorization;

    if (authHeader)
    {
        const parts = authHeader.trim().split(" ");

        if (
            parts.length === 2 &&
            parts[0].toLowerCase() === "bearer"
        )
        {
            token = parts[1];
        }
    }

    if (!token)
    {
        return error(
            res,
            "Missing authorization token",
            401
        );
    }

    try
    {
    req.user = jwt.verify(
    token,
    JWT_SECRET,
    {
        issuer:"RR-Revived"
    }
);

        next();
    }
    catch(err)
    {
        return error(
            res,
            "Invalid or expired token",
            401
        );
    }
}

module.exports={
    generateToken,
    verifyToken,
    JWT_SECRET
};