import { AgentRunResult, runGroqJson } from "./utils";

const AGENT_SYSTEM_PROMPT =
  "You are a clinical risk detection AI. Analyse the patient's aggregated records and return a JSON array of risk signals. Each signal: { riskId: string, severity: 'critical'|'high'|'medium'|'low', category: 'drug-interaction'|'disease-progression'|'missing-screening'|'polypharmacy'|'allergy-conflict', title: string, description: string, recommendation: string, evidence: string[] }. Return ONLY a JSON array.";

export class RiskDetectorAgent {
  async run(input: unknown): Promise<AgentRunResult<Array<Record<string, unknown>>>> {
    return runGroqJson<Array<Record<string, unknown>>>(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
  }
}
