const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { v4: uuidv4 } = require("uuid");


// Routes

const authRoutes =
require("./routes/auth");

const accountsRoutes =
require("./routes/accounts");

const apiRoutes =
require("./routes/api");

const apimRoutes =
require("./routes/apim");

const roomsRoutes =
require("./routes/rooms");

const matchRoutes =
require("./routes/match");

const nsRoutes =
require("./routes/ns");



const app = express();



app.use(cors());

// Unity Analytics NDJSON parser FIRST

app.use((req,res,next)=>{

    if(
        req.service === "unity" &&
        req.path.startsWith("/v1/events")
    )
    {
        return express.text({
            type:"*/*"
        })(req,res,next);
    }

    next();

});
 
app.use(express.json({
    limit:"10mb"
}));


app.use(express.urlencoded({
    extended:true,
    limit:"10mb"
}));


app.use(
    morgan("dev")
);

app.use((req,res,next)=>{

    console.log(
        "[RAW HOST]",
        req.headers.host
    );

    next();

});



// Request logger

app.use(
(req,res,next)=>{


    req.id = uuidv4();


    console.log(
"\n================================================"
    );

    console.log(
"Incoming Request"
    );

    console.log(
"================================================"
    );


    console.log(
"ID      :",
req.id
    );


    console.log(
"HOST    :",
req.headers.host
    );


    console.log(
"SERVICE :",
req.service
    );


    console.log(
"METHOD  :",
req.method
    );


    console.log(
"PATH    :",
req.url
    );


    console.log(
"================================================\n"
    );


    next();


});




// Debug Rec Room traffic

app.use(
(req,res,next)=>{


    if(
        [
            "auth",
            "accounts",
            "api",
            "apim",
            "rooms",
            "match"
        ]
        .includes(req.service)
    )
    {

        console.log(
            "[RR REQUEST]",
            req.service,
            req.method,
            req.url
        );

    }


    next();


});

// Normal JSON APIs
app.use((req,res,next)=>{

    console.log(
        "=============================="
    );

    console.log(
        "[HEADERS]"
    );

    console.log(
        req.headers
    );


    if(req.body && Object.keys(req.body).length)
    {

        console.log(
            "[BODY]"
        );

        console.log(
            req.body
        );

    }


    console.log(
        "=============================="
    );


    next();

});
app.use(express.urlencoded({extended:true}));

// Health

app.get(
"/health",
(req,res)=>{


    res.json({

        status:"alive",

        project:"RR-Revived",

        version:"0.1.0"

    });


});

// Service router

function serviceRouter(service,router)
{

    return (req,res,next)=>{
        if(req.service === service)
        {

            console.log(
                "[SERVICE MATCH]",
                service
            );


            return router(
                req,
                res,
                next
            );

        }


        next();

    };

}

// Rec Room services


app.use(
serviceRouter(
    "auth",
    authRoutes
));


app.use(
serviceRouter(
    "accounts",
    accountsRoutes
));


app.use(
serviceRouter(
    "api",
    apiRoutes
));


app.use(
serviceRouter(
    "apim",
    apimRoutes
));


app.use(
serviceRouter(
    "rooms",
    roomsRoutes
));


app.use(
serviceRouter(
    "match",
    matchRoutes
));

// Unity services

app.use(
serviceRouter(
"unity",
(req,res)=>{


    console.log(
        "[UNITY STUB]"
    );


    console.log(
        "[UNITY PATH]",
        req.path
    );



    if(
        req.path === "/v1/events"
    )
    {


        const body =
        Buffer.isBuffer(req.body)
        ? req.body.toString()
        : String(req.body);


        const lines =
        body
        .split(/\r?\n/)
        .filter(
        line => line.trim().length
    );



        console.log(
            "[UNITY EVENTS]",
            lines.length
        );



        for(
            const line of lines
        )
        {

            try
            {

                const event =
                    JSON.parse(line);


                console.log(
                    "[UNITY EVENT]",
                    event.type || "common"
                );


            }
            catch(err)
            {

                console.log(
                    "[UNITY PARSE FAILED]"
                );

            }

        }



        return res
            .status(200)
            .send("{}");


    }



    console.log("[UNITY RESPONSE] Sending fake config");

    res.json({
        enabled:true,
        environment:"production"
    });


})
);

// Google connectivity check

app.use(
serviceRouter(
"google",
(req,res)=>{


    console.log(
        "[GOOGLE STUB]"
    );


    res.status(204)
    .end();


})
);

function assetStub(name)
{
    return (req,res)=>{

        console.log(
            `[${name.toUpperCase()} STUB]`,
            req.method,
            req.path
        );

        res.status(200).end();

    };
}

// Services
for(const service of [
    "cdn",
    "images",
    "storage",
    "data",
    "static",
    "files",
    "avatars"
])
{
    app.use(
        serviceRouter(
            service,
            assetStub(service)
        )
    );
}

// Unknown

app.use(
(req,res)=>{


    console.log(
        "[UNKNOWN SERVICE]",
        req.service
    );


    res.status(200)
    .json({

        status:"stub",

        service:req.service,

        host:req.headers.host,

        path:req.path,

        timestamp:
        new Date().toISOString()

    });


});

// Error handler

app.use(
(err,req,res,next)=>{


    console.error(err);


    res.status(500)
    .json({

        success:false,

        error:
        err.message ||
        "Internal Server Error"

    });


});





module.exports = app;