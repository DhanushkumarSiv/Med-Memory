import { embedText, getEmbeddingDimension } from "./ragEmbeddings";
import {
  ensureRagVectorInfrastructure,
  RagVectorDocument,
  RagVectorSearchResult,
  searchRagVectorDocuments,
  upsertRagVectorDocuments,
} from "./ragVectorStore";
import { AgentRunResult, runGroqJson } from "./utils";

const RAG_SYSTEM_PROMPT =
  "You are a clinical RAG assistant. Use ONLY the provided health record context. If context is insufficient, say so clearly. Do not invent facts. Return strict JSON: { answer: string, relevantRecords: { date: string, source: string, type: string, content: string }[], confidence: 'high'|'medium'|'low', caveat: string|null } and nothing else.";

const TOP_K = 8;

interface RagInputRecord {
  resourceType?: string;
  resourceId?: string;
  recordedAt?: string;
  sourceName?: string;
  payload?: unknown;
  summary?: string;
}

interface RagRunInput {
  question?: string;
  patientId?: string;
  records?: RagInputRecord[];
}

interface RagOutputRecord {
  date: string;
  source: string;
  type: string;
  content: string;
}

interface RagStructuredOutput extends Record<string, unknown> {
  answer: string;
  relevantRecords: RagOutputRecord[];
  confidence: "high" | "medium" | "low";
  caveat: string | null;
}

interface ParsedVitals {
  systolic: number | null;
  diastolic: number | null;
  glucose: number | null;
  hba1c: number | null;
  heartRate: number | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function normalizeRecordType(type: string): string {
  const lowered = type.toLowerCase();
  if (lowered.includes("medication")) {
    return "Medication";
  }
  if (lowered.includes("condition")) {
    return "Condition";
  }
  if (lowered.includes("imaging") || lowered.includes("diagnosticreport")) {
    return "Imaging";
  }
  if (lowered.includes("observation") || lowered.includes("lab")) {
    return "Lab";
  }
  return type || "Record";
}

function parsePatientIdFromPayload(payload: unknown): string | null {
  if (!isObject(payload)) {
    return null;
  }

  const subject = payload.subject;
  if (isObject(subject) && typeof subject.reference === "string") {
    const match = subject.reference.match(/Patient\/(.+)$/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  if (typeof payload.patientId === "string" && payload.patientId.trim()) {
    return payload.patientId.trim();
  }

  if (typeof payload.id === "string" && payload.id.trim()) {
    return payload.id.trim();
  }

  return null;
}

function normalizeTimestamp(recordedAt: string | undefined): string {
  if (!recordedAt) {
    return new Date().toISOString();
  }
  const parsed = new Date(recordedAt);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function firstNumber(text: string): number | null {
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) {
    return null;
  }
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function extractVitals(summary: string, payloadText: string): ParsedVitals {
  const combined = `${summary}\n${payloadText}`.toLowerCase();
  const bpMatch = combined.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  const systolic = bpMatch ? Number(bpMatch[1]) : null;
  const diastolic = bpMatch ? Number(bpMatch[2]) : null;

  const glucoseMatch = combined.match(/(?:glucose|sugar)[^0-9-]*(-?\d+(\.\d+)?)/);
  const hba1cMatch = combined.match(/(?:hba1c|a1c)[^0-9-]*(-?\d+(\.\d+)?)/);
  const heartRateMatch = combined.match(/(?:heart rate|pulse|bpm)[^0-9-]*(-?\d+(\.\d+)?)/);

  return {
    systolic,
    diastolic,
    glucose: glucoseMatch ? Number(glucoseMatch[1]) : null,
    hba1c: hba1cMatch ? Number(hba1cMatch[1]) : null,
    heartRate: heartRateMatch ? Number(heartRateMatch[1]) : null,
  };
}

function buildEmbeddingText(record: RagInputRecord): string {
  const payloadText = stringifyUnknown(record.payload);
  const parts = [
    `Type: ${record.resourceType ?? "unknown"}`,
    `Source: ${record.sourceName ?? "unknown"}`,
    `Date: ${record.recordedAt ?? "unknown"}`,
    `Summary: ${record.summary ?? ""}`,
    `Payload: ${payloadText}`,
  ];
  return parts.join("\n");
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function derivePatientId(input: RagRunInput, records: RagInputRecord[]): string | null {
  if (typeof input.patientId === "string" && input.patientId.trim()) {
    return input.patientId.trim();
  }
  for (const record of records) {
    const parsed = parsePatientIdFromPayload(record.payload);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function buildDocumentId(patientId: string | null, record: RagInputRecord): string {
  const stableId = record.resourceId?.trim() || hashString(`${record.summary ?? ""}::${record.recordedAt ?? ""}::${stringifyUnknown(record.payload)}`);
  return `${patientId ?? "unknown"}::${record.resourceType ?? "resource"}::${stableId}`;
}

function buildLabels(record: RagInputRecord): string[] {
  const text = `${record.resourceType ?? ""} ${record.summary ?? ""}`.toLowerCase();
  const labels = new Set<string>();
  if (text.includes("blood pressure") || text.includes("bp") || text.includes("hypertension")) {
    labels.add("blood-pressure");
  }
  if (text.includes("glucose") || text.includes("sugar") || text.includes("hba1c") || text.includes("diabetes")) {
    labels.add("sugar");
  }
  if (text.includes("heart rate") || text.includes("pulse") || text.includes("bpm") || text.includes("cardiac")) {
    labels.add("heart-rate");
  }
  if (text.includes("medication") || text.includes("tablet") || text.includes("dose")) {
    labels.add("medication");
  }
  if (text.includes("allergy")) {
    labels.add("allergy");
  }
  if (labels.size === 0) {
    labels.add("general");
  }
  return [...labels];
}

function toRelevantRecords(results: RagVectorSearchResult[]): RagOutputRecord[] {
  return results.map((result) => ({
    date: result.timestamp,
    source: result.sourceName || "Unknown source",
    type: normalizeRecordType(result.resourceType),
    content: result.summary || result.rawData || "No content",
  }));
}

function inferConfidenceFromScores(results: RagVectorSearchResult[]): "high" | "medium" | "low" {
  if (results.length === 0) {
    return "low";
  }
  const topScore = results[0]?.score ?? 0;
  if (topScore >= 0.84) {
    return "high";
  }
  if (topScore >= 0.68) {
    return "medium";
  }
  return "low";
}

function fallbackResponse(
  message: string,
  relevantRecords: RagOutputRecord[] = [],
  caveat: string | null = null
): RagStructuredOutput {
  return {
    answer: message,
    relevantRecords,
    confidence: relevantRecords.length > 0 ? "medium" : "low",
    caveat,
  };
}

function normalizeGroqOutput(raw: Record<string, unknown>, fallback: RagStructuredOutput): RagStructuredOutput {
  const answer = typeof raw.answer === "string" && raw.answer.trim() ? raw.answer.trim() : fallback.answer;
  const confidenceCandidate = raw.confidence;
  const confidence: "high" | "medium" | "low" =
    confidenceCandidate === "high" || confidenceCandidate === "medium" || confidenceCandidate === "low"
      ? confidenceCandidate
      : fallback.confidence;

  const records = Array.isArray(raw.relevantRecords)
    ? raw.relevantRecords
        .map((record): RagOutputRecord | null => {
          if (!isObject(record)) {
            return null;
          }
          const date = typeof record.date === "string" ? record.date : "";
          const source = typeof record.source === "string" ? record.source : "";
          const type = typeof record.type === "string" ? record.type : "";
          const content = typeof record.content === "string" ? record.content : "";
          if (!date && !source && !type && !content) {
            return null;
          }
          return { date, source, type, content };
        })
        .filter((record): record is RagOutputRecord => record !== null)
    : fallback.relevantRecords;

  const caveat = typeof raw.caveat === "string" ? raw.caveat : fallback.caveat;
  return { answer, confidence, relevantRecords: records, caveat };
}

export class RagMemoryAgent {
  async run(input: unknown): Promise<AgentRunResult<Record<string, unknown>>> {
    const payload = (isObject(input) ? input : {}) as RagRunInput;
    const question = typeof payload.question === "string" ? payload.question.trim() : "";

    if (!question) {
      return {
        data: fallbackResponse("Please provide a question to query patient health data.", [], "Empty query."),
        tokensUsed: 0,
      };
    }

    const records = Array.isArray(payload.records) ? payload.records : [];
    const patientId = derivePatientId(payload, records);
    const embeddingDimension = getEmbeddingDimension();

    try {
      await ensureRagVectorInfrastructure(embeddingDimension);
    } catch (error) {
      return {
        data: fallbackResponse(
          "Unable to access the health memory index right now. Please retry.",
          [],
          `Vector DB setup failed: ${(error as Error).message}`
        ),
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }

    try {
      if (records.length > 0) {
        const vectorDocs: RagVectorDocument[] = [];
        for (const record of records) {
          const embeddingText = buildEmbeddingText(record);
          const embedding = await embedText(embeddingText, embeddingDimension);
          const patientKey = parsePatientIdFromPayload(record.payload) ?? patientId ?? "unknown";
          const rawData = stringifyUnknown(record.payload);
          const vitals = extractVitals(record.summary ?? "", rawData);

          vectorDocs.push({
            docId: buildDocumentId(patientKey, record),
            patientId: patientKey,
            resourceId: record.resourceId ?? "",
            resourceType: record.resourceType ?? "Unknown",
            timestamp: normalizeTimestamp(record.recordedAt),
            sourceName: record.sourceName ?? "Unknown source",
            summary: record.summary ?? "",
            rawData,
            embedding,
            labels: buildLabels(record),
            systolic: vitals.systolic,
            diastolic: vitals.diastolic,
            glucose: vitals.glucose,
            hba1c: vitals.hba1c,
            heartRate: vitals.heartRate,
          });
        }
        await upsertRagVectorDocuments(vectorDocs);
      }
    } catch (error) {
      return {
        data: fallbackResponse(
          "I could not update the semantic health memory for this patient.",
          [],
          `Embedding upsert failed: ${(error as Error).message}`
        ),
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }

    let retrieved: RagVectorSearchResult[] = [];
    try {
      const queryEmbedding = await embedText(question, embeddingDimension);
      retrieved = await searchRagVectorDocuments(queryEmbedding, patientId, TOP_K);
    } catch (error) {
      return {
        data: fallbackResponse(
          "I could not retrieve relevant health records right now.",
          [],
          `Semantic retrieval failed: ${(error as Error).message}`
        ),
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }

    if (retrieved.length === 0) {
      return {
        data: fallbackResponse(
          "No relevant health records were found for this query.",
          [],
          "No semantic matches in vector database."
        ),
        tokensUsed: 0,
      };
    }

    const relevantRecords = toRelevantRecords(retrieved);
    const fallback = fallbackResponse(
      `Based on the retrieved records, the most relevant finding is: ${relevantRecords[0]?.content ?? "No details available."}`,
      relevantRecords,
      null
    );
    fallback.confidence = inferConfidenceFromScores(retrieved);

    const generationPayload = {
      question,
      patientId,
      retrieval: {
        method: "semantic-vector-search",
        topK: TOP_K,
        records: retrieved.map((item) => ({
          date: item.timestamp,
          source: item.sourceName,
          type: normalizeRecordType(item.resourceType),
          content: item.summary || item.rawData,
          score: Number(item.score.toFixed(4)),
          labels: item.labels,
          rawData: item.rawData,
        })),
      },
    };

    const generation = await runGroqJson<Record<string, unknown>>(RAG_SYSTEM_PROMPT, JSON.stringify(generationPayload));
    if (!generation.data) {
      return {
        data: {
          ...fallback,
          caveat: generation.error ? `Groq generation failed: ${generation.error}` : fallback.caveat,
        },
        tokensUsed: generation.tokensUsed,
        error: generation.error,
      };
    }

    const normalized = normalizeGroqOutput(generation.data, fallback);
    return {
      data: normalized,
      tokensUsed: generation.tokensUsed,
      error: generation.error,
    };
  }
}
