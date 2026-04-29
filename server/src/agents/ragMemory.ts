import { AgentRunResult, runClaudeJson } from "./utils";

const AGENT_SYSTEM_PROMPT =
  "You are a medical history retrieval agent. Given retrieved patient records and a clinician question, answer ONLY the asked intent (for example medications, allergies, labs, cardiac condition) and avoid unrelated conditions unless asked. Write concise natural-language clinical text, do not repeat the user's question, and if records do not support the question, clearly say that. Return strict JSON with schema: { answer: string, relevantRecords: { date: string, source: string, type: string, content: string }[], confidence: 'high'|'medium'|'low', caveat: string|null }. Keep answer factual and grounded in provided records only. Return ONLY valid JSON.";

export class RagMemoryAgent {
  async run(input: unknown): Promise<AgentRunResult<Record<string, unknown>>> {
    return runClaudeJson<Record<string, unknown>>(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
  }
}
