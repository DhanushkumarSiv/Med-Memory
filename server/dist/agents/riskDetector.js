"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskDetectorAgent = void 0;
const utils_1 = require("./utils");
const AGENT_SYSTEM_PROMPT = "You are a clinical risk detection AI. Analyse the patient's aggregated records and return a JSON array of risk signals. Each signal: { riskId: string, severity: 'critical'|'high'|'medium'|'low', category: 'drug-interaction'|'disease-progression'|'missing-screening'|'polypharmacy'|'allergy-conflict', title: string, description: string, recommendation: string, evidence: string[] }. Return ONLY a JSON array.";
class RiskDetectorAgent {
    async run(input) {
        return (0, utils_1.runClaudeJson)(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
    }
}
exports.RiskDetectorAgent = RiskDetectorAgent;
