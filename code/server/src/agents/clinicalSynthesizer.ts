import { AgentRunResult, runGroqJson } from "./utils";

const AGENT_SYSTEM_PROMPT =
  "You are a senior clinical AI assistant synthesizing a patient's complete health history for a clinician at point of care. Given structured patient data, write a clinical summary in this exact JSON format: { patientOverview: string, activeProblems: string[], currentMedications: string[], keyFindings: string, longitudinalNarrative: string, clinicalPearls: string[] }. Be precise, clinical, and concise. Return ONLY valid JSON.";

export class ClinicalSynthesizerAgent {
  async run(input: unknown): Promise<AgentRunResult<Record<string, unknown>>> {
    return runGroqJson<Record<string, unknown>>(AGENT_SYSTEM_PROMPT, JSON.stringify(input));
  }
}
