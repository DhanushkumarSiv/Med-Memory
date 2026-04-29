import { useState } from "react";
import api from "../services/api";
import { PipelineResult } from "../types/agent";
import axios from "axios";

export function useAgentPipeline(patientId: string | null): {
  pipeline: PipelineResult | null;
  loading: boolean;
  loadingStep: string;
  ragLoading: boolean;
  ragResponse: Record<string, unknown> | null;
  runPipeline: () => Promise<PipelineResult | null>;
  runQuery: (question: string) => Promise<Record<string, unknown> | null>;
} {
  const [pipeline, setPipeline] = useState<PipelineResult | null>(null);
  const [ragResponse, setRagResponse] = useState<Record<string, unknown> | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
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
    setRagLoading(true);
    setRagResponse(null);

    try {
      const response = await api.post<Record<string, unknown>>(`/patients/${patientId}/query`, { question });
      setRagResponse(response.data);
      return response.data;
    } catch (error) {
      let message = error instanceof Error ? error.message : "RAG query failed";
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as { message?: string; error?: string } | undefined;
        if (responseData?.error) {
          message = responseData.error;
        } else if (responseData?.message) {
          message = responseData.message;
        }
      }
      const fallback = {
        answer: `Unable to process query right now. ${message}`,
        confidence: "low",
        relevantRecords: [],
        caveat: "Client-side fallback error message.",
      };
      setRagResponse(fallback);
      return fallback;
    } finally {
      setRagLoading(false);
    }
  };

  return { pipeline, loading, loadingStep, ragLoading, ragResponse, runPipeline, runQuery };
}
