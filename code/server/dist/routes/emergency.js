"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const neo4j_1 = require("../db/neo4j");
const router = express_1.default.Router();
router.post("/:abhaId", async (req, res) => {
    try {
        const { reason, accessor } = req.body;
        if (!reason || reason.trim().length < 3) {
            res.status(400).json({ message: "Reason is mandatory for break-glass access" });
            return;
        }
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (p:Patient {abhaId: $abhaId})
      RETURN p
      LIMIT 1
      `, { abhaId: req.params.abhaId });
        if (!rows[0]) {
            res.status(404).json({ message: "Patient not found" });
            return;
        }
        const patient = rows[0].p;
        const details = await (0, neo4j_1.runQuery)(`
      MATCH (:Patient {id: $patientId})-[:HAS_SOURCE]->(:FhirSource)-[:CONTAINS]->(r:FhirResource)
      RETURN r.resourceType AS resourceType, r.payload AS payload
      `, { patientId: patient.id });
        await (0, neo4j_1.runQuery)(`
      MATCH (p:Patient {id: $patientId})
      CREATE (a:AuditEntry {
        id: $id,
        accessor: $accessor,
        action: 'emergency_break_glass',
        resourceAccessed: $resourceAccessed,
        consentTokenUsed: $reason,
        accessedAt: $accessedAt
      })
      MERGE (p)-[:HAS_AUDIT_ENTRY]->(a)
      `, {
            patientId: patient.id,
            id: (0, uuid_1.v4)(),
            accessor: accessor ?? "emergency-operator",
            resourceAccessed: `emergency/${req.params.abhaId}`,
            reason,
            accessedAt: new Date().toISOString(),
        });
        const conditions = details
            .filter((row) => row.resourceType === "Condition")
            .map((row) => JSON.parse(row.payload));
        const medications = details
            .filter((row) => row.resourceType === "MedicationRequest")
            .map((row) => JSON.parse(row.payload));
        const allergies = details
            .filter((row) => row.resourceType === "AllergyIntolerance")
            .map((row) => JSON.parse(row.payload));
        res.json({
            patient: {
                id: patient.id,
                abhaId: patient.abhaId,
                name: patient.name,
                gender: patient.gender,
            },
            conditions,
            medications,
            allergies,
            breakGlassReason: reason,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Emergency access failed", error: error.message });
    }
});
exports.default = router;
