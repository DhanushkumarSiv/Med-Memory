export interface RiskSignal {
  riskId: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "drug-interaction" | "disease-progression" | "missing-screening" | "polypharmacy" | "allergy-conflict";
  title: string;
  description: string;
  recommendation: string;
  evidence: string[];
}

export interface PipelineResult {
  aggregated: Record<string, unknown> | null;
  synthesis: Record<string, unknown> | null;
  risks: RiskSignal[] | null;
  failedAgents: string[];
  timestamp: string;
}
