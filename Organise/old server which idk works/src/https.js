const https = require("https");
const fs = require("fs");
const path = require("path");

const app = require("./index");


const redirects = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "redirects.json"),
        "utf8"
    )
);



const options = {

    key: fs.readFileSync(
        path.join(__dirname, "..", "certs", "server.key")
    ),

    cert: fs.readFileSync(
        path.join(__dirname, "..", "certs", "server.crt")
    )

};



// HTTPS wrapper

const serverApp = (req,res)=>{


    const host =
        (req.headers.host || "")
        .split(":")[0]
        .toLowerCase();



    console.log(
        "[HTTPS]",
        host,
        req.method,
        req.url
    );



    const service =
        redirects.redirect[host];



    console.log(
        "[REDIRECT LOOKUP]",
        host,
        "=>",
        service
    );



    if(!service)
    {

        console.log(
            "[UNKNOWN HOST]",
            host
        );


        res.writeHead(
            200,
            {
                "content-type":"application/json"
            }
        );


        return res.end(
            JSON.stringify({

                error:"Unknown Host",

                host

            })
        );

    }



    console.log(
        "[ROUTE]",
        host,
        "->",
        service
    );



    // Attach virtual service
    req.service = service;



    // Extra debugging
    console.log(
        "[SERVICE ROUTE]",
        host,
        "=>",
        service
    );



    app(
        req,
        res
    );


};




https
.createServer(
    options,
    serverApp
)
.listen(
    443,
    "0.0.0.0",
    ()=>{


        console.log(
"========================================"
        );

        console.log(
" RR-Revived HTTPS Server"
        );

        console.log(
"========================================"
        );


        console.log(
" Listening : https://0.0.0.0:443"
        );


        console.log("");

        console.log(
"Loaded redirects:"
        );


        Object.keys(
            redirects.redirect
        )
        .forEach(
            h =>
            console.log(
                " ",
                h
            )
        );


        console.log(
"========================================"
        );


    });