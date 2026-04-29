"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagMemoryAgent = void 0;
const utils_1 = require("./utils");
const AGENT_SYSTEM_PROMPT = "You are a medical history retrieval agent. Given retrieved patient records and a clinician question, write a concise natural-language clinical answer that directly answers the question. Do not repeat the user's question in the answer. Return strict JSON with schema: { answer: string, relevantRecords: { date: string, source: string, type: string, content: string }[], confidence: 'high'|'medium'|'low', caveat: string|null }. Keep answer factual and grounded in provided records only. Return ONLY valid JSON.";
class RagMemoryAgent {
    async run(input) {
        return (0, utils_1.runClaudeJson)(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
    }
}
exports.RagMemoryAgent = RagMemoryAgent;
