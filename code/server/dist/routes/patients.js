"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const orchestrator_1 = require("../agents/orchestrator");
const neo4j_1 = require("../db/neo4j");
const offlineDemo_1 = require("../fhir/offlineDemo");
const normalizer_1 = require("../fhir/normalizer");
const consentGuard_1 = require("../middleware/consentGuard");
const router = express_1.default.Router();
const orchestrator = new orchestrator_1.AgentOrchestrator();
function isDbUnavailableError(error) {
    const message = error?.message?.toLowerCase() ?? "";
    return message.includes("failed to connect to server") || message.includes("serviceunavailable");
}
function buildOfflinePipeline(patientId) {
    const rows = (0, offlineDemo_1.getOfflineFhirRowsByPatientId)(patientId);
    const summary = (0, normalizer_1.normalizeFhirRows)(rows);
    const activeProblems = summary.conditions.map((condition) => condition.title).slice(0, 6);
    const currentMedications = summary.medications.map((medication) => medication.title).slice(0, 8);
    const recentLabs = summary.labs
        .slice(0, 4)
        .map((lab) => `${lab.title}: ${lab.details}`);
    return {
        aggregated: {
            conditions: summary.conditions,
            medications: summary.medications,
            labs: summary.labs,
            allergies: summary.allergies,
            procedures: [],
        },
        synthesis: {
            patientOverview: `Consolidated chart contains ${summary.conditions.length} active conditions, ${summary.medications.length} medication records, and ${summary.labs.length} lab observations.`,
            activeProblems,
            currentMedications,
            keyFindings: recentLabs.length > 0 ? `Recent labs: ${recentLabs.join("; ")}` : "No recent labs available.",
            longitudinalNarrative: "Offline demo mode: data served from bundled mock records.",
            clinicalPearls: [
                "Review medications against the latest labs.",
                "Cross-check allergy entries before prescribing.",
            ],
        },
        risks: [],
        timestamp: new Date().toISOString(),
        failedAgents: [],
    };
}
function buildOfflineRagResponse(question, patientId) {
    const rows = (0, offlineDemo_1.getOfflineFhirRowsByPatientId)(patientId);
    const normalizedQuestion = question.toLowerCase();
    const prioritized = rows
        .map((row) => ({
        row,
        text: `${row.resourceType} ${row.sourceName} ${row.payload}`.toLowerCase(),
    }))
        .map((entry) => {
        let score = 0;
        if (normalizedQuestion.includes("medication") && entry.row.resourceType === "MedicationRequest") {
            score += 4;
        }
        if (normalizedQuestion.includes("allergy") && entry.row.resourceType === "AllergyIntolerance") {
            score += 4;
        }
        if ((normalizedQuestion.includes("lab") || normalizedQuestion.includes("result")) && entry.row.resourceType === "Observation") {
            score += 4;
        }
        if ((normalizedQuestion.includes("cardiac") || normalizedQuestion.includes("heart")) && entry.text.includes("hypertension")) {
            score += 5;
        }
        const tokens = normalizedQuestion.split(/\s+/).filter((token) => token.length > 2);
        for (const token of tokens) {
            if (entry.text.includes(token)) {
                score += 1;
            }
        }
        return { ...entry, score };
    })
        .sort((left, right) => right.score - left.score)
        .slice(0, 6);
    const relevantRecords = prioritized.map((entry) => ({
        date: entry.row.recordedAt,
        source: entry.row.sourceName,
        type: entry.row.resourceType,
        content: entry.row.payload,
    }));
    const top = relevantRecords[0];
    return {
        answer: top
            ? `Most relevant chart finding: ${top.type} from ${top.source} on ${top.date}.`
            : "No strong match found in offline demo records.",
        confidence: top ? "medium" : "low",
        relevantRecords,
        caveat: "Offline demo mode response.",
    };
}
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
        if (isDbUnavailableError(error)) {
            const patientId = String(req.params.id ?? "");
            const offlinePatient = (0, offlineDemo_1.getOfflinePatientById)(patientId);
            if (offlinePatient) {
                res.json(offlinePatient);
                return;
            }
        }
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
        if (isDbUnavailableError(error)) {
            const patientId = String(req.params.id ?? "");
            const offlineRows = (0, offlineDemo_1.getOfflineFhirRowsByPatientId)(patientId);
            if (offlineRows.length > 0) {
                res.json((0, normalizer_1.normalizeFhirRows)(offlineRows));
                return;
            }
        }
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
        if (isDbUnavailableError(error)) {
            const patientId = String(req.params.id ?? "");
            const offlineRows = (0, offlineDemo_1.getOfflineFhirRowsByPatientId)(patientId);
            if (offlineRows.length > 0) {
                res.json(buildOfflinePipeline(patientId));
                return;
            }
        }
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
        if (isDbUnavailableError(error)) {
            const patientId = String(req.params.id ?? "");
            const offlineRows = (0, offlineDemo_1.getOfflineFhirRowsByPatientId)(patientId);
            if (offlineRows.length > 0) {
                const question = String(req.body.question ?? "");
                res.json(buildOfflineRagResponse(question, patientId));
                return;
            }
        }
        res.status(500).json({ message: "RAG query failed", error: error.message });
    }
});
exports.default = router;
