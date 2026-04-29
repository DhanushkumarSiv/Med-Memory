"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const orchestrator_1 = require("../agents/orchestrator");
const neo4j_1 = require("../db/neo4j");
const normalizer_1 = require("../fhir/normalizer");
const consentGuard_1 = require("../middleware/consentGuard");
const router = express_1.default.Router();
const orchestrator = new orchestrator_1.AgentOrchestrator();
function denyIfUnauthorisedProvider(req, res) {
    const user = req.user;
    if (!user) {
        res.status(401).json({ message: "Unauthorized" });
        return true;
    }
    if (user.role !== "provider" || user.authorised !== true) {
        res.status(403).json({ message: "Only authorised providers can access this route" });
        return true;
    }
    return false;
}
router.get("/", async (req, res) => {
    try {
        if (denyIfUnauthorisedProvider(req, res)) {
            return;
        }
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (p:Patient)
      RETURN p
      ORDER BY p.name
      `);
        res.json(rows.map((row) => ({
            id: row.p.id,
            name: row.p.name,
            abhaId: row.p.abhaId,
            dob: row.p.dob,
            gender: row.p.gender,
        })));
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch patients", error: error.message });
    }
});
router.get("/:id", (0, consentGuard_1.consentGuard)("patient:read"), async (req, res) => {
    try {
        const patientId = String(req.params.id ?? "");
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (p:Patient {id: $patientId})
      RETURN p
      LIMIT 1
      `, { patientId });
        if (!rows[0]) {
            res.status(404).json({ message: "Patient not found" });
            return;
        }
        res.json(rows[0].p);
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch patient", error: error.message });
    }
});
router.get("/:id/fhir-summary", (0, consentGuard_1.consentGuard)("patient:fhir"), async (req, res) => {
    try {
        const patientId = String(req.params.id ?? "");
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (:Patient {id: $patientId})-[:HAS_SOURCE]->(s:FhirSource)-[:CONTAINS]->(r:FhirResource)
      RETURN r.resourceId AS resourceId, r.resourceType AS resourceType, r.payload AS payload, r.recordedAt AS recordedAt, s.sourceName AS sourceName
      ORDER BY r.recordedAt DESC
      `, { patientId });
        res.json((0, normalizer_1.normalizeFhirRows)(rows));
    }
    catch (error) {
        res.status(500).json({ message: "Failed to get FHIR summary", error: error.message });
    }
});
router.post("/:id/run-pipeline", (0, consentGuard_1.consentGuard)("patient:run-pipeline"), async (req, res) => {
    try {
        const patientId = String(req.params.id ?? "");
        const result = await orchestrator.runPipeline(patientId);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ message: "Pipeline execution failed", error: error.message });
    }
});
router.post("/:id/query", (0, consentGuard_1.consentGuard)("patient:query"), async (req, res) => {
    try {
        const patientId = String(req.params.id ?? "");
        const { question } = req.body;
        if (!question) {
            res.status(400).json({ message: "question is required" });
            return;
        }
        const result = await orchestrator.runRagQuery(patientId, question);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ message: "RAG query failed", error: error.message });
    }
});
exports.default = router;
