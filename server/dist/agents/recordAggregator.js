"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordAggregatorAgent = void 0;
const utils_1 = require("./utils");
const AGENT_SYSTEM_PROMPT = "You are a medical record aggregator. You receive raw FHIR R4 JSON bundles from multiple hospital sources for one patient. Your job is to: (1) de-duplicate records (same condition from two sources = one entry), (2) resolve conflicts (prefer most recent, flag discrepancies), (3) produce a structured JSON summary with sections: conditions[], medications[], labs[], allergies[], procedures[]. Each item must include source, date, and status. Return ONLY valid JSON, no prose.";
class RecordAggregatorAgent {
    async run(input) {
        return (0, utils_1.runClaudeJson)(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
    }
}
exports.RecordAggregatorAgent = RecordAggregatorAgent;
