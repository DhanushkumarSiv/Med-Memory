"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const neo4j_1 = require("../db/neo4j");
const otpService_1 = require("../services/otpService");
const consentGuard_1 = require("../middleware/consentGuard");
const router = express_1.default.Router();
router.get("/:patientId", (0, consentGuard_1.consentGuard)("consent:read"), async (req, res) => {
    try {
        const patientId = String(req.params.patientId ?? "");
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (:Patient {id: $patientId})-[:GRANTED_ACCESS_TO]->(c:ConsentToken)
      RETURN c
      ORDER BY c.grantedAt DESC
      `, { patientId });
        res.json(rows.map((row) => row.c));
    }
    catch (error) {
        res.status(500).json({ message: "Failed to list consent tokens", error: error.message });
    }
});
router.post("/:patientId/grant", (0, consentGuard_1.consentGuard)("consent:read"), async (req, res) => {
    try {
        const patientId = String(req.params.patientId ?? "");
        const { providerName, providerType, scopes, expiresAt, providerId } = req.body;
        if (!providerName || !providerType || !scopes || scopes.length === 0 || !expiresAt) {
            res.status(400).json({ message: "providerName, providerType, scopes and expiresAt are required" });
            return;
        }
        const tokenId = (0, uuid_1.v4)();
        const token = (0, uuid_1.v4)();
        await (0, neo4j_1.runQuery)(`
      MATCH (p:Patient {id: $patientId})
      OPTIONAL MATCH (provider:Provider {id: $providerId})
      CREATE (c:ConsentToken {
        id: $id,
        token: $token,
        providerName: $providerName,
        providerType: $providerType,
        scopes: $scopes,
        grantedAt: $grantedAt,
        expiresAt: $expiresAt,
        revokedAt: null
      })
      MERGE (p)-[:GRANTED_ACCESS_TO]->(c)
      FOREACH (_ IN CASE WHEN provider IS NULL THEN [] ELSE [1] END | MERGE (c)-[:AUTHORISES]->(provider))
      `, {
            patientId,
            providerId: providerId ?? null,
            id: tokenId,
            token,
            providerName,
            providerType,
            scopes: JSON.stringify(scopes),
            grantedAt: new Date().toISOString(),
            expiresAt,
        });
        res.status(201).json({ id: tokenId, token });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to grant consent", error: error.message });
    }
});
router.delete("/:patientId/revoke/:tokenId", (0, consentGuard_1.consentGuard)("consent:read"), async (req, res) => {
    try {
        const patientId = String(req.params.patientId ?? "");
        const tokenId = String(req.params.tokenId ?? "");
        await (0, neo4j_1.runQuery)(`
      MATCH (:Patient {id: $patientId})-[:GRANTED_ACCESS_TO]->(c:ConsentToken {id: $tokenId})
      SET c.revokedAt = $revokedAt
      `, {
            patientId,
            tokenId,
            revokedAt: new Date().toISOString(),
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to revoke consent", error: error.message });
    }
});
router.get("/:patientId/pending-otps", (0, consentGuard_1.consentGuard)("consent:read"), async (req, res) => {
    try {
        const pending = await (0, otpService_1.listPendingOtps)(String(req.params.patientId ?? ""));
        res.json(pending);
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch pending OTP requests", error: error.message });
    }
});
router.post("/:patientId/pending-otps/:otpId/deny", (0, consentGuard_1.consentGuard)("consent:read"), async (req, res) => {
    try {
        await (0, otpService_1.invalidateOtp)(String(req.params.otpId ?? ""));
        res.json({ denied: true });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to deny OTP request", error: error.message });
    }
});
exports.default = router;
