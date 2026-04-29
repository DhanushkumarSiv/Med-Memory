"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const neo4j_1 = require("../db/neo4j");
const consentGuard_1 = require("../middleware/consentGuard");
const router = express_1.default.Router();
router.get("/:patientId", (0, consentGuard_1.consentGuard)("audit:read"), async (req, res) => {
    try {
        const patientId = String(req.params.patientId ?? "");
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (:Patient {id: $patientId})-[:HAS_AUDIT_ENTRY]->(a:AuditEntry)
      RETURN a
      ORDER BY a.accessedAt DESC
      LIMIT 100
      `, { patientId });
        res.json(rows.map((row) => row.a));
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch audit entries", error: error.message });
    }
});
exports.default = router;
