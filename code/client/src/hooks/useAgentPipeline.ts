import { useState } from "react";
import api from "../services/api";
import { PipelineResult } from "../types/agent";

export function useAgentPipeline(patientId: string | null): {
  pipeline: PipelineResult | null;
  loading: boolean;
  loadingStep: string;
  ragResponse: Record<string, unknown> | null;
  runPipeline: () => Promise<PipelineResult | null>;
  runQuery: (question: string) => Promise<Record<string, unknown> | null>;
} {
  const [pipeline, setPipeline] = useState<PipelineResult | null>(null);
  const [ragResponse, setRagResponse] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");

  const runPipeline = async (): Promise<PipelineResult | null> => {
    if (!patientId) {
      return null;
    }
    setLoading(true);

    try {
      setLoadingStep("Aggregating records...");
      await new Promise((resolve) => setTimeout(resolve, 500));
      setLoadingStep("Synthesizing...");
      await new Promise((resolve) => setTimeout(resolve, 500));
      setLoadingStep("Detecting risks...");
      await new Promise((resolve) => setTimeout(resolve, 500));
      setLoadingStep("Building memory index...");

      const response = await api.post<PipelineResult>(`/patients/${patientId}/run-pipeline`);
      setPipeline(response.data);
      return response.data;
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const runQuery = async (question: string): Promise<Record<string, unknown> | null> => {
    if (!patientId) {
      return null;
    }

    const response = await api.post<Record<string, unknown>>(`/patients/${patientId}/query`, { question });
    setRagResponse(response.data);
    return response.data;
  };

  return { pipeline, loading, loadingStep, ragResponse, runPipeline, runQuery };
}
