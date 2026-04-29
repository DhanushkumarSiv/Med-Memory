"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagMemoryAgent = void 0;
const utils_1 = require("./utils");
const AGENT_SYSTEM_PROMPT = "You are a medical history retrieval agent. Given a patient's complete structured health record and a clinician's question, retrieve the most relevant historical information and return: { answer: string, relevantRecords: { date: string, source: string, type: string, content: string }[], confidence: 'high'|'medium'|'low', caveat: string|null }. Return ONLY valid JSON.";
class RagMemoryAgent {
    async run(input) {
        return (0, utils_1.runGroqJson)(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
    }
}
exports.RagMemoryAgent = RagMemoryAgent;
