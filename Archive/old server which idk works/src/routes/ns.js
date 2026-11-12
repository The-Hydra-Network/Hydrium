const express = require("express");

const router = express.Router();


router.all("*",(req,res)=>{

    console.log("[NS STUB]",
        req.method,
        req.path
    );

    res.json({
        success:true
    });

});


module.exports = router;