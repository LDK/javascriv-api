"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const database_1 = require("./database");
const users_1 = __importDefault(require("./routes/users"));
const projects_1 = __importDefault(require("./routes/projects"));
// Get connection to DB
const dataSource = (0, database_1.getDataSource)();
// Once the connection is established, we initialize the Express app
dataSource.then(() => {
    const app = (0, express_1.default)();
    var allowedOrigins = process.env.DB_ALLOWED_ORIGINS
        ? process.env.DB_ALLOWED_ORIGINS.split(',')
        : [];
    console.log("Allowed origins: ", allowedOrigins);
    app.use((0, cors_1.default)({
        origin: function (origin, callback) {
            // allow requests with no origin 
            // (like mobile apps or curl requests)
            if (!origin)
                return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                var msg = 'The CORS policy for this site does not ' +
                    'allow access from the specified Origin.';
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
        credentials: true,
        allowedHeaders: ['Authorization', 'Content-Type']
    }));
    app.use(express_1.default.json({ limit: '50mb' })); // for parsing application/json
    app.use('/', users_1.default);
    app.use('/', projects_1.default);
    // Heroku will add the port to the environment variables
    // If it doesn't exist, default to 4000 for local development
    const port = process.env.PORT || 4000;
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}).catch((error) => console.log("Error: ", error));
