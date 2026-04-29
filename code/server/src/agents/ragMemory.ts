import { AgentRunResult, runGroqJson } from "./utils";

const AGENT_SYSTEM_PROMPT =
  "You are a medical history retrieval agent. Given a patient's complete structured health record and a clinician's question, retrieve the most relevant historical information and return: { answer: string, relevantRecords: { date: string, source: string, type: string, content: string }[], confidence: 'high'|'medium'|'low', caveat: string|null }. Return ONLY valid JSON.";

export class RagMemoryAgent {
  async run(input: unknown): Promise<AgentRunResult<Record<string, unknown>>> {
    return runGroqJson<Record<string, unknown>>(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
  }
}
