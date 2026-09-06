require("dotenv").config();

const express = require("express");

const app = express();
const port = Number(process.env.PORT) || 9000;

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const JWT_SECRET =
    process.env.HYDRIUM_JWT_SECRET ||
    "hydrium-development-secret";

if (!process.env.HYDRIUM_JWT_SECRET) {
    console.warn(
        "[SERVER] HYDRIUM_JWT_SECRET is not configured; using fallback development secret."
    );

    process.env.HYDRIUM_JWT_SECRET = JWT_SECRET;
}

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);

// --------------------------------------------------
// CORS
// --------------------------------------------------

app.use((req, res, next) => {

    res.header(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );

    res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,DELETE,PATCH,OPTIONS"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// --------------------------------------------------
// Basic request logging
// --------------------------------------------------

app.use((req, res, next) => {

    console.log(
        `[HTTP] ${req.method} ${req.originalUrl}`
    );

    next();
});

// --------------------------------------------------
// Application route modules
// --------------------------------------------------

const routeModules = [

    ["api", "./api"],

    ["auth", "./auth"],

    ["accounts", "./accounts"],

    ["playersettings", "./playersettings"],

    ["datacollection", "./datacollection"],

    ["econ", "./econ"],

    ["ns", "./ns"],

    ["notify", "./notify"],

    ["platformnotifications", "./platformnotifications"],

    ["match", "./match"]

];

for (
    const [name, modulePath]
    of routeModules
) {

    try {

        const route =
            require(modulePath);

        if (
            typeof route !==
            "function"
        ) {

            throw new TypeError(
                `./${name} does not export an Express middleware/router.`
            );
        }

        app.use(route);

        console.log(
            `[SERVER] Loaded route module: ./${name}`
        );

    } catch (error) {

        console.error(
            `[SERVER] Failed to load route module: ./${name}`
        );

        console.error(
            error
        );

        throw error;
    }
}

// --------------------------------------------------
// API fallback
// --------------------------------------------------
//
// IMPORTANT:
// Do NOT return 200 {} for unknown API routes.
//
// A response such as:
//
//     200 {}
//
// causes the Unity client to believe the request
// succeeded, followed by:
//     "Deserialization returned null"
//     "Malformed Response: '{}'"
//
// A real 404 exposes the missing endpoint instead.
// --------------------------------------------------

app.use((req, res, next) => {

    if (
        !req.originalUrl.startsWith(
            "/api"
        )
    ) {
        return next();
    }

    console.log(
        `[API] UNHANDLED API ROUTE: ${req.method} ${req.originalUrl}`
    );

    return res
        .status(404)
        .json({

            error:
                "API endpoint not implemented",

            method:
                req.method,

            path:
                req.originalUrl
        });
});

// --------------------------------------------------
// Generic 404 handler
// --------------------------------------------------

app.use((req, res) => {

    console.log(
        `[404] ${req.method} ${req.originalUrl}`
    );

    return res
        .status(404)
        .json({

            error:
                "Not found",

            path:
                req.originalUrl
        });
});

// --------------------------------------------------
// Global error handler
// --------------------------------------------------

app.use(
    (err, req, res, next) => {

        console.error(
            "[SERVER] Unhandled error:"
        );

        console.error(
            err
        );

        if (
            res.headersSent
        ) {
            return next(err);
        }

        return res
            .status(500)
            .json({

                error:
                    "Internal server error"
            });
    }
);

// --------------------------------------------------
// Start server
// --------------------------------------------------

const server =
    app.listen(
        port,
        "127.0.0.1",
        () => {

            console.log("");

            console.log(
                "========================================"
            );

            console.log(
                "           HYDRIUM SERVER"
            );

            console.log(
                "========================================"
            );

            console.log(
                `[HYDRIUM] Server listening on http://127.0.0.1:${port}`
            );

            console.log(
                `[HYDRIUM] Game version: ${
                    process.env.GAME_VERSION ||
                    "20231207"
                }`
            );

            console.log(
                "========================================"
            );

            console.log("");
        }
    );

// --------------------------------------------------
// Server error handling
// --------------------------------------------------

server.on(
    "error",
    (error) => {

        if (
            error.code ===
            "EADDRINUSE"
        ) {

            console.error(
                `[HYDRIUM] Port ${port} is already in use.`
            );

        } else {

            console.error(
                "[HYDRIUM] Server error:",
                error
            );
        }

        process.exit(1);
    }
);

// --------------------------------------------------
// Graceful shutdown
// --------------------------------------------------

function shutdown(signal) {

    console.log(
        `[HYDRIUM] Received ${signal}. Shutting down...`
    );

    server.close(
        () => {

            console.log(
                "[HYDRIUM] Server stopped."
            );

            process.exit(0);
        }
    );
}

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);

// --------------------------------------------------
// Export
// --------------------------------------------------

module.exports = app;