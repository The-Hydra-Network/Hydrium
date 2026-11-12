const https = require("https");
const fs = require("fs");
const httpProxy = require("http-proxy");

const proxy = httpProxy.createProxyServer({
    target: "http://127.0.0.1:8080",
    changeOrigin: true
});

proxy.on("error", (err, req, res) => {
    console.error("PROXY ERROR:", err.message);

    res.writeHead(500);
    res.end("Proxy error");
});


// Temporary certificate
const options = {
    key: fs.readFileSync("./certs/server.key"),
    cert: fs.readFileSync("./certs/server.crt")
};


https.createServer(
    options,
    (req,res)=>
    {
        console.log(
            "[HTTPS]",
            req.headers.host,
            req.url
        );

        proxy.web(req,res);
    }
)
.listen(
443,
"0.0.0.0",
()=>
{
    console.log(
        "HTTPS proxy running on port 443"
    );
});