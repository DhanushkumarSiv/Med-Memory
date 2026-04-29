"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const neo4j_1 = require("../db/neo4j");
const router = express_1.default.Router();
router.get("/:token", async (req, res) => {
    try {
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (c:ConsentToken {token: $token})
      RETURN c
      LIMIT 1
      `, { token: req.params.token });
        const consent = rows[0]?.c;
        if (!consent) {
            res.status(404).json({ valid: false, reason: "token_not_found" });
            return;
        }
        const now = new Date();
        const expired = new Date(String(consent.expiresAt)).getTime() < now.getTime();
        const revoked = Boolean(consent.revokedAt);
        res.json({ valid: !expired && !revoked, expired, revoked, consent });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to verify consent token", error: error.message });
    }
});
exports.default = router;
