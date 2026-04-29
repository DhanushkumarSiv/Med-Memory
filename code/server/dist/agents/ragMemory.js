"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagMemoryAgent = void 0;
const utils_1 = require("./utils");
const AGENT_SYSTEM_PROMPT = "You are a medical history retrieval agent. Given retrieved patient records and a clinician question, answer only the asked intent (for example medications, allergies, labs, cardiac condition) and avoid unrelated conditions unless asked. Write a concise natural-language clinical answer without repeating the question text. Return strict JSON: { answer: string, relevantRecords: { date: string, source: string, type: string, content: string }[], confidence: 'high'|'medium'|'low', caveat: string|null }. Ground all claims in provided records only. Return ONLY valid JSON.";
class RagMemoryAgent {
    async run(input) {
        return (0, utils_1.runGroqJson)(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
    }
}
exports.RagMemoryAgent = RagMemoryAgent;
