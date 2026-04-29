"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const loadEnv_1 = require("./config/loadEnv");
const auth_1 = __importDefault(require("./routes/auth"));
const patients_1 = __importDefault(require("./routes/patients"));
const consent_1 = __importDefault(require("./routes/consent"));
const consentPublic_1 = __importDefault(require("./routes/consentPublic"));
const fhir_1 = __importDefault(require("./routes/fhir"));
const audit_1 = __importDefault(require("./routes/audit"));
const agents_1 = __importDefault(require("./routes/agents"));
const emergency_1 = __importDefault(require("./routes/emergency"));
const authMiddleware_1 = require("./middleware/authMiddleware");
const neo4j_1 = require("./db/neo4j");
const seed_1 = require("./db/seed");
const app = (0, express_1.default)();
(0, loadEnv_1.loadEnv)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "MedMemory OS API" });
});
app.get("/health/services", async (_req, res) => {
    const neo4j = await (0, neo4j_1.checkNeo4jHealth)();
    const status = neo4j.up ? "ok" : "degraded";
    res.status(neo4j.up ? 200 : 503).json({
        status,
        api: { up: true },
        neo4j: {
            up: neo4j.up,
            error: neo4j.error ?? null,
        },
        timestamp: new Date().toISOString(),
    });
});
app.use("/api/v1/auth", auth_1.default);
app.use("/api/v1/fhir", fhir_1.default);
app.use("/api/v1/emergency", emergency_1.default);
app.use("/api/v1/consent/verify", consentPublic_1.default);
app.use("/api/v1/patients", authMiddleware_1.authMiddleware, patients_1.default);
app.use("/api/v1/consent", authMiddleware_1.authMiddleware, consent_1.default);
app.use("/api/v1/audit", authMiddleware_1.authMiddleware, audit_1.default);
app.use("/api/v1/agents", authMiddleware_1.authMiddleware, agents_1.default);
async function start() {
    try {
        await (0, neo4j_1.initConstraints)();
        await (0, seed_1.seedGraph)();
        const port = Number(process.env.PORT ?? 3001);
        app.listen(port, () => {
            // eslint-disable-next-line no-console
            console.log(`MedMemory server running on port ${port}`);
        });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error("Server startup failed", error);
        process.exit(1);
    }
}
void start();
