"use strict";

// Hydrium - PUT /account/me/profileimage
// The game uploads the photo first (through the image server), then tells the
// server its file name: PUT /account/me/profileimage  { imageName: "<uuid>.jpg" }
// This stores that name in the account's profileImage field, which /account/me and
// /account/bulk already return.
//
// Mount in index.js before app.use(auth) (e.g. after the hydrium-rooms line):
//   app.use(require("./hydrium-profile").router);

const express = require("express");
const jwt = require("jsonwebtoken");
const pb = require("./pb");

const router = express.Router();
const COLLECTION = pb.hydriumCollections.accounts;
const SECRET = process.env.HYDRIUM_JWT_SECRET || "hydrium-development-secret";

function accountId(req) {
    const h = String(req.headers.authorization || "");
    if (!/^Bearer /i.test(h)) return null;
    try {
        return Number(jwt.verify(h.slice(7).trim(), SECRET).sub);
    } catch {
        return null;
    }
}

router.put(
    "/account/me/profileimage",
    express.json({ type: () => true, limit: "20kb" }),
    express.urlencoded({ extended: false }),
    async (req, res) => {
        const me = accountId(req);
        if (!Number.isSafeInteger(me) || me <= 0) return res.status(401).json({ success: false, error: "Unauthorized", value: null });

        const b = req.body && typeof req.body === "object" ? req.body : {};
        const name = String(b.imageName ?? b.ImageName ?? req.query.imageName ?? "").trim();
        // file names only: no folders, no odd characters
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(name) || name.includes("..")) {
            return res.status(400).json({ success: false, error: "Invalid imageName", value: null });
        }

        try {
            const rec = await pb.collection(COLLECTION).getFirstListItem(`accountId = ${me}`);
            await pb.collection(COLLECTION).update(rec.id, { profileImage: name });
            console.log(`[PROFILE] profileImage for ${me} = ${name}`);
            return res.status(200).json({ success: true, error: null, value: name, imageName: name });
        } catch (err) {
            console.error(`[PROFILE] could not save profileImage for ${me}:`, err.message);
            return res.status(500).json({ success: false, error: "Could not save profile image", value: null });
        }
    }
);

module.exports = { router };
