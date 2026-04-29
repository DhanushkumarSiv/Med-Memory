"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClinicalSynthesizerAgent = void 0;
const utils_1 = require("./utils");
const AGENT_SYSTEM_PROMPT = "You are a senior clinical AI assistant synthesizing a patient's complete health history for a clinician at point of care. Given structured patient data, write a clinical summary in this exact JSON format: { patientOverview: string, activeProblems: string[], currentMedications: string[], keyFindings: string, longitudinalNarrative: string, clinicalPearls: string[] }. Be precise, clinical, and concise. Return ONLY valid JSON.";
class ClinicalSynthesizerAgent {
    async run(input) {
        return (0, utils_1.runClaudeJson)(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
    }
}
exports.ClinicalSynthesizerAgent = ClinicalSynthesizerAgent;
