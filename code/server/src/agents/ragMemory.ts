import { AgentRunResult, runGroqJson } from "./utils";

const AGENT_SYSTEM_PROMPT =
  "You are a medical history retrieval agent. Given retrieved patient records and a clinician question, answer only the asked intent (for example medications, allergies, labs, cardiac condition) and avoid unrelated conditions unless asked. Write a concise natural-language clinical answer without repeating the question text. Return strict JSON: { answer: string, relevantRecords: { date: string, source: string, type: string, content: string }[], confidence: 'high'|'medium'|'low', caveat: string|null }. Ground all claims in provided records only. Return ONLY valid JSON.";

export class RagMemoryAgent {
  async run(input: unknown): Promise<AgentRunResult<Record<string, unknown>>> {
    return runGroqJson<Record<string, unknown>>(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
  }
}
