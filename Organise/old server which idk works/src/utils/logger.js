const log = (subdomain, msg, data = null) =>
{
    const ts =
        new Date().toISOString();


    const prefix =
        `[${ts}] [${subdomain}]`;


    if(data !== null)
    {
        if(typeof data === "object")
        {
            console.log(
                `${prefix} ${msg}\n`,
                JSON.stringify(
                    data,
                    null,
                    2
                )
            );
        }
        else
        {
            console.log(
                `${prefix} ${msg}: ${data}`
            );
        }
    }
    else
    {
        console.log(
            `${prefix} ${msg}`
        );
    }
};



const requestLog = (req) =>
{
    log(
        "HTTP",
        `${req.method} ${req.originalUrl}`,
        {
            host:req.headers.host,
            ip:req.ip
        }
    );
};



module.exports =
{
    log,
    requestLog
};