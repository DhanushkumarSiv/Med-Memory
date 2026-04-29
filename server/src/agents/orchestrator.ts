import { v4 as uuidv4 } from "uuid";
import { runQuery } from "../db/neo4j";
import { ClinicalSynthesizerAgent } from "./clinicalSynthesizer";
import { RagMemoryAgent } from "./ragMemory";
import { RecordAggregatorAgent } from "./recordAggregator";
import { RiskDetectorAgent } from "./riskDetector";
import { InMemoryVectorMemory, VectorMatch, VectorRagRecord } from "./vectorMemory";

interface FhirRow {
  resourceType: string;
  resourceId: string;
  payload: string;
  recordedAt: string;
  sourceName: string;
}

interface AggregatedItem {
  name: string;
  source: string;
  date: string;
  status: string;
  details?: string;
}

interface PipelineResult {
  aggregated: Record<string, unknown> | null;
  synthesis: Record<string, unknown> | null;
  risks: Array<Record<string, unknown>> | null;
  timestamp: string;
  failedAgents: string[];
}

const vectorMemory = new InMemoryVectorMemory();

function safeText(value: unknown, fallback = "Unknown"): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toPayloadObject(rawPayload: unknown): Record<string, unknown> {
  if (typeof rawPayload === "string") {
    try {
      const parsed = JSON.parse(rawPayload) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    return rawPayload as Record<string, unknown>;
  }

  return {};
}

function buildFallbackAggregated(fhirRecords: FhirRow[]): Record<string, unknown> {
  const conditions: AggregatedItem[] = [];
  const medications: AggregatedItem[] = [];
  const labs: AggregatedItem[] = [];
  const allergies: AggregatedItem[] = [];
  const procedures: AggregatedItem[] = [];

  for (const row of fhirRecords) {
    const payload = toPayloadObject(row.payload);
    const status = safeText(payload.status, safeText((payload.clinicalStatus as Record<string, unknown> | undefined)?.text, "active"));

    if (row.resourceType === "Condition") {
      conditions.push({
        name: safeText((payload.code as Record<string, unknown> | undefined)?.text),
        source: row.sourceName,
        date: row.recordedAt,
        status,
      });
    } else if (row.resourceType === "MedicationRequest") {
      medications.push({
        name: safeText((payload.medicationCodeableConcept as Record<string, unknown> | undefined)?.text),
        source: row.sourceName,
        date: row.recordedAt,
        status,
        details: safeText((payload.dosageInstruction as Array<Record<string, unknown>> | undefined)?.[0]?.text, "No dose"),
      });
    } else if (row.resourceType === "Observation") {
      const valueQuantity = payload.valueQuantity as Record<string, unknown> | undefined;
      const value = valueQuantity
        ? `${String(valueQuantity.value ?? "")} ${String(valueQuantity.unit ?? "")}`.trim()
        : safeText(payload.valueString, "No value");
      labs.push({
        name: safeText((payload.code as Record<string, unknown> | undefined)?.text),
        source: row.sourceName,
        date: row.recordedAt,
        status,
        details: value,
      });
    } else if (row.resourceType === "AllergyIntolerance") {
      allergies.push({
        name: safeText((payload.code as Record<string, unknown> | undefined)?.text),
        source: row.sourceName,
        date: row.recordedAt,
        status: "active",
        details: safeText((payload.reaction as Array<Record<string, unknown>> | undefined)?.[0]?.description, "No reaction details"),
      });
    } else if (row.resourceType === "Procedure") {
      procedures.push({
        name: safeText((payload.code as Record<string, unknown> | undefined)?.text),
        source: row.sourceName,
        date: row.recordedAt,
        status,
      });
    }
  }

  return { conditions, medications, labs, allergies, procedures };
}

function buildFallbackSynthesis(aggregated: Record<string, unknown>): Record<string, unknown> {
  const conditions = (aggregated.conditions as AggregatedItem[] | undefined) ?? [];
  const medications = (aggregated.medications as AggregatedItem[] | undefined) ?? [];
  const labs = (aggregated.labs as AggregatedItem[] | undefined) ?? [];

  const activeProblems = conditions.slice(0, 6).map((item) => item.name);
  const currentMedications = medications.slice(0, 8).map((item) => (item.details ? `${item.name} (${item.details})` : item.name));
  const recentLabs = labs.slice(0, 4).map((item) => `${item.name}: ${item.details ?? "N/A"}`);

  return {
    patientOverview: `Consolidated chart contains ${conditions.length} active conditions, ${medications.length} medication records, and ${labs.length} lab observations from linked FHIR sources.`,
    activeProblems,
    currentMedications,
    keyFindings: recentLabs.length > 0 ? `Recent labs: ${recentLabs.join("; ")}` : "No recent labs available in current records.",
    longitudinalNarrative: "Historical records were merged across hospital, lab, and pharmacy sources. Review trends and risk signals before making therapy changes.",
    clinicalPearls: [
      "Validate medication reconciliation against latest renal and glycemic labs.",
      "Cross-check allergy list before prescribing or modifying treatment.",
      "Use RAG query panel for targeted historical retrieval at point of care.",
    ],
  };
}

function buildFallbackRisks(aggregated: Record<string, unknown>): Array<Record<string, unknown>> {
  const meds = (aggregated.medications as AggregatedItem[] | undefined) ?? [];
  const labs = (aggregated.labs as AggregatedItem[] | undefined) ?? [];
  const allergies = (aggregated.allergies as AggregatedItem[] | undefined) ?? [];
  const risks: Array<Record<string, unknown>> = [];

  const eGfrLab = labs.find((lab) => lab.name.toLowerCase().includes("egfr"));
  if (eGfrLab) {
    const match = (eGfrLab.details ?? "").match(/(\d+(\.\d+)?)/);
    const value = match ? Number(match[1]) : NaN;
    if (!Number.isNaN(value) && value < 60) {
      risks.push({
        riskId: "risk-egfr-decline",
        severity: "high",
        category: "disease-progression",
        title: "Reduced eGFR suggests CKD progression risk",
        description: `Latest eGFR appears reduced (${eGfrLab.details ?? "value unavailable"}).`,
        recommendation: "Review nephrotoxic exposures, optimize BP/DM targets, and schedule renal trend follow-up.",
        evidence: [`Observation: ${eGfrLab.name} from ${eGfrLab.source} on ${eGfrLab.date}`],
      });
    }
  }

  const hba1cLab = labs.find((lab) => lab.name.toLowerCase().includes("hba1c"));
  if (hba1cLab) {
    const match = (hba1cLab.details ?? "").match(/(\d+(\.\d+)?)/);
    const value = match ? Number(match[1]) : NaN;
    if (!Number.isNaN(value) && value >= 8) {
      risks.push({
        riskId: "risk-hba1c-high",
        severity: "medium",
        category: "disease-progression",
        title: "Suboptimal glycemic control",
        description: `HbA1c is elevated (${hba1cLab.details ?? "value unavailable"}).`,
        recommendation: "Reassess adherence, lifestyle, and antihyperglycemic regimen intensification.",
        evidence: [`Observation: ${hba1cLab.name} from ${hba1cLab.source} on ${hba1cLab.date}`],
      });
    }
  }

  if (meds.length >= 5) {
    risks.push({
      riskId: "risk-polypharmacy",
      severity: "medium",
      category: "polypharmacy",
      title: "Polypharmacy risk",
      description: `Current chart includes ${meds.length} medications.`,
      recommendation: "Perform interaction review and deprescribing check where clinically appropriate.",
      evidence: meds.slice(0, 6).map((med) => `Medication: ${med.name} (${med.date})`),
    });
  }

  if (allergies.length > 0) {
    risks.push({
      riskId: "risk-allergy-precaution",
      severity: "high",
      category: "allergy-conflict",
      title: "Critical allergy precautions required",
      description: "One or more documented allergies require active prescribing checks.",
      recommendation: "Confirm allergy list before ordering new medication.",
      evidence: allergies.map((allergy) => `${allergy.name}: ${allergy.details ?? ""}`),
    });
  }

  return risks.length > 0
    ? risks
    : [
        {
          riskId: "risk-none-detected",
          severity: "low",
          category: "missing-screening",
          title: "No high-severity automated risks detected",
          description: "Fallback analysis did not detect strong risk patterns from available records.",
          recommendation: "Continue routine review and monitoring.",
          evidence: ["Fallback pipeline output used due to AI call issue."],
        },
      ];
}

function buildDeterministicRagResponse(
  question: string,
  matches: VectorMatch[],
  fallbackReason?: string
): Record<string, unknown> {
  const describeMatch = (match: VectorMatch): string => {
    const { record } = match;
    const payload = record.payload;
    const date = record.recordedAt;
    const source = record.sourceName;

    if (record.resourceType === "Condition") {
      const condition = safeText((payload.code as Record<string, unknown> | undefined)?.text, "an active condition");
      const status = safeText(
        (payload.clinicalStatus as Record<string, unknown> | undefined)?.text,
        safeText(payload.status, "active")
      );
      return `${condition} is documented with ${status} status (${date}, ${source}).`;
    }

    if (record.resourceType === "DiagnosticReport") {
      const reportName = safeText((payload.code as Record<string, unknown> | undefined)?.text, "diagnostic report");
      const conclusion = safeText(payload.conclusion, "no conclusion text is available");
      return `The ${reportName} report from ${source} on ${date} concludes: ${conclusion}.`;
    }

    if (record.resourceType === "Observation") {
      const testName = safeText((payload.code as Record<string, unknown> | undefined)?.text, "observation");
      const quantity = payload.valueQuantity as Record<string, unknown> | undefined;
      const measuredValue = quantity
        ? `${String(quantity.value ?? "")} ${String(quantity.unit ?? "")}`.trim()
        : safeText(payload.valueString, "no measured value");
      return `${testName} was recorded as ${measuredValue} (${date}, ${source}).`;
    }

    if (record.resourceType === "MedicationRequest") {
      const medication = safeText(
        (payload.medicationCodeableConcept as Record<string, unknown> | undefined)?.text,
        "medication"
      );
      const dose = safeText((payload.dosageInstruction as Array<Record<string, unknown>> | undefined)?.[0]?.text, "dose not specified");
      return `${medication} is listed in the chart with instruction: ${dose} (${date}, ${source}).`;
    }

    return `A relevant ${record.resourceType} record is available from ${source} on ${date}.`;
  };

  const relevantRecords = matches.slice(0, 6).map((match) => ({
    date: match.record.recordedAt,
    source: match.record.sourceName,
    type: match.record.resourceType,
    content: match.content,
    score: Number(match.score.toFixed(4)),
  }));

  const topMatch = relevantRecords[0];
  const answer =
    topMatch && matches[0]
      ? fallbackAnswerByFocus(question, matches)
      : "No strong match was found in this patient's available records.";

  const confidence = relevantRecords.length >= 4 ? "high" : relevantRecords.length > 0 ? "medium" : "low";

  return {
    answer,
    confidence,
    relevantRecords,
    caveat: fallbackReason
      ? `Returned from local vector retrieval because LLM output was unavailable: ${fallbackReason}`
      : "Returned from local vector retrieval index.",
  };
}

function normalizeRagOutput(output: Record<string, unknown>, fallbackCaveat?: string): Record<string, unknown> {
  const confidence = output.confidence;
  const normalizedConfidence =
    confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "medium";

  const answer =
    typeof output.answer === "string" && output.answer.trim().length > 0
      ? output.answer
      : "Relevant patient records were found. Please review cited entries.";

  const relevantRecords = Array.isArray(output.relevantRecords) ? output.relevantRecords : [];
  const caveat =
    typeof output.caveat === "string" && output.caveat.trim().length > 0
      ? output.caveat
      : fallbackCaveat ?? "Response normalized from model output.";

  return {
    ...output,
    answer,
    confidence: normalizedConfidence,
    relevantRecords,
    caveat,
  };
}

function stripQuestionEcho(answer: string, question: string): string {
  const normalized = answer.trim();
  const escapedQuestion = question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`^based on the patient's records\\s*(for\\s*)?"?${escapedQuestion}"?[:,\\-]?\\s*`, "i"),
    new RegExp(`^for\\s+the\\s+question\\s+"?${escapedQuestion}"?[:,\\-]?\\s*`, "i"),
  ];

  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      const stripped = normalized.replace(pattern, "").trim();
      if (stripped.length > 0) {
        return stripped.charAt(0).toUpperCase() + stripped.slice(1);
      }
    }
  }
  return normalized;
}

interface QueryFocus {
  preferredTypes: string[];
  strictTypes: string[];
  keywords: string[];
  topicKeywords: string[];
}

function inferQueryFocus(question: string): QueryFocus {
  const normalized = question.toLowerCase();
  const preferredTypes: string[] = [];
  const strictTypes: string[] = [];

  if (/(medication|medicine|drug|tablet|prescription)/.test(normalized)) {
    preferredTypes.push("MedicationRequest");
    strictTypes.push("MedicationRequest");
  }
  if (/(allergy|allergic|reaction|anaphylaxis)/.test(normalized)) {
    preferredTypes.push("AllergyIntolerance");
    strictTypes.push("AllergyIntolerance");
  }
  if (/(condition|diagnosis|disease|problem|status)/.test(normalized)) {
    preferredTypes.push("Condition");
  }
  if (/(lab|result|value|test|scan|report|ecg|echo|imaging|finding)/.test(normalized)) {
    preferredTypes.push("Observation", "DiagnosticReport");
    strictTypes.push("Observation", "DiagnosticReport");
  }

  const keywords = normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2)
    .filter((token) => !["what", "which", "show", "about", "patient", "tell", "with", "from", "this"].includes(token));

  const topicKeywords: string[] = [];
  if (/(cardiac|heart|cardio|coronary|stent|bp|hypertension|ecg|echo)/.test(normalized)) {
    topicKeywords.push("cardiac", "heart", "cardio", "coronary", "stent", "hypertension", "ecg", "echo", "blood pressure");
  }
  if (/(renal|kidney|egfr|creatinine|ckd)/.test(normalized)) {
    topicKeywords.push("renal", "kidney", "egfr", "creatinine", "ckd");
  }
  if (/(diabetes|hba1c|glucose|glycemic)/.test(normalized)) {
    topicKeywords.push("diabetes", "hba1c", "glucose", "glycemic", "metformin", "empagliflozin");
  }

  if (topicKeywords.length > 0 && !strictTypes.includes("Condition") && preferredTypes.includes("Condition")) {
    strictTypes.push("Condition");
  }

  return {
    preferredTypes: Array.from(new Set(preferredTypes)),
    strictTypes: Array.from(new Set(strictTypes)),
    keywords: Array.from(new Set(keywords)),
    topicKeywords: Array.from(new Set(topicKeywords)),
  };
}

function filterMatchesForQuestion(matches: VectorMatch[], question: string): VectorMatch[] {
  const focus = inferQueryFocus(question);

  if (matches.length === 0) {
    return [];
  }

  const rescored = matches
    .map((match) => {
      let score = match.score;
      if (focus.preferredTypes.includes(match.record.resourceType)) {
        score += 0.55;
      }
      if (focus.strictTypes.length > 0 && !focus.strictTypes.includes(match.record.resourceType)) {
        score -= 0.35;
      }

      const searchableText = `${match.content} ${JSON.stringify(match.record.payload)}`.toLowerCase();
      let keywordHits = 0;
      for (const keyword of focus.keywords) {
        if (searchableText.includes(keyword)) {
          keywordHits += 1;
        }
      }
      if (keywordHits > 0) {
        score += Math.min(0.45, keywordHits * 0.1);
      }
      if (focus.topicKeywords.length > 0) {
        const topicHits = focus.topicKeywords.filter((keyword) => searchableText.includes(keyword)).length;
        if (topicHits > 0) {
          score += Math.min(0.6, topicHits * 0.15);
        } else {
          score -= 0.2;
        }
      }

      return { ...match, score };
    })
    .sort((left, right) => right.score - left.score);

  let focused = rescored;
  if (focus.strictTypes.length > 0) {
    const strict = focused.filter((match) => focus.strictTypes.includes(match.record.resourceType));
    if (strict.length > 0) {
      focused = strict;
    }
  }

  if (focus.topicKeywords.length > 0) {
    const topicFocused = focused.filter((match) => {
      const searchableText = `${match.content} ${JSON.stringify(match.record.payload)}`.toLowerCase();
      return focus.topicKeywords.some((keyword) => searchableText.includes(keyword));
    });
    if (topicFocused.length > 0) {
      focused = topicFocused;
    }
  }

  if (focus.keywords.length > 0) {
    const keywordFocused = focused.filter((match) => {
      const searchableText = `${match.content} ${JSON.stringify(match.record.payload)}`.toLowerCase();
      return focus.keywords.some((keyword) => searchableText.includes(keyword));
    });
    if (keywordFocused.length > 0) {
      focused = keywordFocused;
    }
  }

  if (focused.length >= 2) {
    return focused;
  }

  return rescored;
}

function fallbackAnswerByFocus(question: string, matches: VectorMatch[]): string {
  const focus = inferQueryFocus(question);
  const top = matches.slice(0, 5);

  if (top.length === 0) {
    return "No matching records were found for this query in the available patient data.";
  }

  if (focus.strictTypes.includes("MedicationRequest")) {
    const lines = top
      .filter((match) => match.record.resourceType === "MedicationRequest")
      .map((match) => {
        const payload = match.record.payload;
        const medication = safeText((payload.medicationCodeableConcept as Record<string, unknown> | undefined)?.text, "Medication");
        const dose = safeText((payload.dosageInstruction as Array<Record<string, unknown>> | undefined)?.[0]?.text, "dose not specified");
        return `${medication} (${dose})`;
      });
    if (lines.length > 0) {
      return `Current medications in the chart are ${lines.join(", ")}.`;
    }
  }

  if (focus.strictTypes.includes("AllergyIntolerance")) {
    const lines = top
      .filter((match) => match.record.resourceType === "AllergyIntolerance")
      .map((match) => {
        const payload = match.record.payload;
        const allergy = safeText((payload.code as Record<string, unknown> | undefined)?.text, "allergy");
        const reaction = safeText((payload.reaction as Array<Record<string, unknown>> | undefined)?.[0]?.description, "reaction not specified");
        return `${allergy} (${reaction})`;
      });
    if (lines.length > 0) {
      return `Documented allergies include ${lines.join(", ")}.`;
    }
  }

  if (focus.strictTypes.includes("Observation") || focus.strictTypes.includes("DiagnosticReport")) {
    const lines = top
      .filter((match) => match.record.resourceType === "Observation" || match.record.resourceType === "DiagnosticReport")
      .map((match) => {
        const payload = match.record.payload;
        if (match.record.resourceType === "DiagnosticReport") {
          const reportName = safeText((payload.code as Record<string, unknown> | undefined)?.text, "Diagnostic report");
          const conclusion = safeText(payload.conclusion, "No conclusion text");
          return `${reportName}: ${conclusion}`;
        }
        const testName = safeText((payload.code as Record<string, unknown> | undefined)?.text, "Observation");
        const quantity = payload.valueQuantity as Record<string, unknown> | undefined;
        const value = quantity ? `${String(quantity.value ?? "")} ${String(quantity.unit ?? "")}`.trim() : safeText(payload.valueString, "No value");
        return `${testName}: ${value}`;
      });
    if (lines.length > 0) {
      return `Relevant recent results are ${lines.join("; ")}.`;
    }
  }

  const conditionLines = top
    .filter((match) => match.record.resourceType === "Condition")
    .map((match) => {
      const payload = match.record.payload;
      const condition = safeText((payload.code as Record<string, unknown> | undefined)?.text, "condition");
      const status = safeText((payload.clinicalStatus as Record<string, unknown> | undefined)?.text, safeText(payload.status, "active"));
      return `${condition} (${status})`;
    });

  if (conditionLines.length > 0) {
    return `The patient’s relevant conditions include ${conditionLines.join(", ")}.`;
  }

  return `Most relevant record found: ${top[0]?.content ?? "No details available"}.`;
}

async function storeAgentOutput(
  patientId: string,
  agentName: string,
  output: unknown,
  tokensUsed: number
): Promise<void> {
  await runQuery(
    `
    MATCH (p:Patient {id: $patientId})
    CREATE (a:AgentOutput {
      id: $id,
      agentName: $agentName,
      output: $output,
      tokensUsed: $tokensUsed,
      createdAt: $createdAt
    })
    MERGE (p)-[:HAS_AGENT_OUTPUT]->(a)
    `,
    {
      patientId,
      id: uuidv4(),
      agentName,
      output: JSON.stringify(output),
      tokensUsed,
      createdAt: new Date().toISOString(),
    }
  );
}

export class AgentOrchestrator {
  private readonly aggregator = new RecordAggregatorAgent();

  private readonly synthesizer = new ClinicalSynthesizerAgent();

  private readonly riskDetector = new RiskDetectorAgent();

  private readonly ragMemory = new RagMemoryAgent();

  async runPipeline(patientId: string): Promise<PipelineResult> {
    const failedAgents: string[] = [];
    const rows = await runQuery<{ r: Record<string, unknown>; s: Record<string, unknown> }>(
      `
      MATCH (:Patient {id: $patientId})-[:HAS_SOURCE]->(s:FhirSource)-[:CONTAINS]->(r:FhirResource)
      RETURN r, s
      ORDER BY r.recordedAt ASC
      `,
      { patientId }
    );

    const fhirRecords: FhirRow[] = rows.map((row) => ({
      resourceType: String(row.r.resourceType),
      resourceId: String(row.r.resourceId),
      payload: String(row.r.payload),
      recordedAt: String(row.r.recordedAt),
      sourceName: String(row.s.sourceName),
    }));

    const aggregateResult = await this.aggregator.run(fhirRecords);
    const deterministicAggregate = buildFallbackAggregated(fhirRecords);
    let aggregated: Record<string, unknown> | null = aggregateResult.data;
    if (aggregateResult.error) {
      failedAgents.push("recordAggregator");
      aggregated = { ...deterministicAggregate, error: aggregateResult.error, fallbackRecords: fhirRecords };
    }
    await storeAgentOutput(patientId, "recordAggregator", aggregated, aggregateResult.tokensUsed);

    const synthesisResult = await this.synthesizer.run(aggregated);
    let synthesis: Record<string, unknown> | null = synthesisResult.data;
    if (synthesisResult.error) {
      failedAgents.push("clinicalSynthesizer");
      synthesis = { ...buildFallbackSynthesis(aggregated ?? deterministicAggregate), error: synthesisResult.error };
    }
    await storeAgentOutput(patientId, "clinicalSynthesizer", synthesis, synthesisResult.tokensUsed);

    const riskResult = await this.riskDetector.run({
      aggregated,
      medications: (aggregated?.medications as unknown[]) ?? [],
    });
    let risks: Array<Record<string, unknown>> | null = riskResult.data;
    if (riskResult.error) {
      failedAgents.push("riskDetector");
      risks = buildFallbackRisks(aggregated ?? deterministicAggregate).map((risk) => ({
        ...risk,
        fallbackReason: riskResult.error,
      }));
    }
    await storeAgentOutput(patientId, "riskDetector", risks, riskResult.tokensUsed);

    return {
      aggregated,
      synthesis,
      risks,
      timestamp: new Date().toISOString(),
      failedAgents,
    };
  }

  async runRagQuery(patientId: string, question: string): Promise<Record<string, unknown>> {
    try {
      const rows = await runQuery<{ r: Record<string, unknown>; s: Record<string, unknown> }>(
        `
        MATCH (:Patient {id: $patientId})-[:HAS_SOURCE]->(s:FhirSource)-[:CONTAINS]->(r:FhirResource)
        RETURN r, s
        ORDER BY r.recordedAt ASC
        `,
        { patientId }
      );

      const records: VectorRagRecord[] = rows.map((row) => ({
        resourceType: String(row.r.resourceType),
        resourceId: String(row.r.resourceId),
        recordedAt: String(row.r.recordedAt),
        sourceName: String(row.s.sourceName),
        payload: toPayloadObject(row.r.payload),
      }));

      const retrieved = vectorMemory.search(patientId, records, question, 12);
      const focusedRetrieved = filterMatchesForQuestion(retrieved, question).slice(0, 8);

      const payload = {
        question,
        retrievalMethod: "hybrid-semantic-search",
        records: focusedRetrieved.map((match) => ({
          resourceType: match.record.resourceType,
          resourceId: match.record.resourceId,
          recordedAt: match.record.recordedAt,
          sourceName: match.record.sourceName,
          payload: match.record.payload,
          retrievedContent: match.content,
          retrievalScore: Number(match.score.toFixed(6)),
        })),
      };

      const ragResult = await this.ragMemory.run(payload);
      const ragData = ragResult.data as Record<string, unknown> | null;
      const hasUsableAnswer = typeof ragData?.answer === "string" && ragData.answer.trim().length > 0;
      const output = hasUsableAnswer
        ? normalizeRagOutput(ragData, ragResult.error ? `Model warning: ${ragResult.error}` : undefined)
        : buildDeterministicRagResponse(question, focusedRetrieved, ragResult.error ?? "rag_failed");

      if (typeof output.answer === "string") {
        output.answer = stripQuestionEcho(output.answer, question);
      }

      try {
        await storeAgentOutput(patientId, "ragMemory", output, ragResult.tokensUsed);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.warn("Failed to persist rag output:", (error as Error).message);
        }
      }

      return output;
    } catch (error) {
      return {
        answer: "Unable to process query right now. Please retry in a moment.",
        confidence: "low",
        relevantRecords: [],
        caveat: `RAG pipeline fallback: ${(error as Error).message}`,
      };
    }
  }
}
