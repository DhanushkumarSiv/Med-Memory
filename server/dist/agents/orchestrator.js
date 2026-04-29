"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentOrchestrator = void 0;
const uuid_1 = require("uuid");
const neo4j_1 = require("../db/neo4j");
const clinicalSynthesizer_1 = require("./clinicalSynthesizer");
const ragMemory_1 = require("./ragMemory");
const recordAggregator_1 = require("./recordAggregator");
const riskDetector_1 = require("./riskDetector");
const vectorMemory_1 = require("./vectorMemory");
const vectorMemory = new vectorMemory_1.InMemoryVectorMemory();
function safeText(value, fallback = "Unknown") {
    return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}
function toPayloadObject(rawPayload) {
    if (typeof rawPayload === "string") {
        try {
            const parsed = JSON.parse(rawPayload);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed;
            }
            return {};
        }
        catch {
            return {};
        }
    }
    if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
        return rawPayload;
    }
    return {};
}
function buildFallbackAggregated(fhirRecords) {
    const conditions = [];
    const medications = [];
    const labs = [];
    const allergies = [];
    const procedures = [];
    for (const row of fhirRecords) {
        const payload = toPayloadObject(row.payload);
        const status = safeText(payload.status, safeText(payload.clinicalStatus?.text, "active"));
        if (row.resourceType === "Condition") {
            conditions.push({
                name: safeText(payload.code?.text),
                source: row.sourceName,
                date: row.recordedAt,
                status,
            });
        }
        else if (row.resourceType === "MedicationRequest") {
            medications.push({
                name: safeText(payload.medicationCodeableConcept?.text),
                source: row.sourceName,
                date: row.recordedAt,
                status,
                details: safeText(payload.dosageInstruction?.[0]?.text, "No dose"),
            });
        }
        else if (row.resourceType === "Observation") {
            const valueQuantity = payload.valueQuantity;
            const value = valueQuantity
                ? `${String(valueQuantity.value ?? "")} ${String(valueQuantity.unit ?? "")}`.trim()
                : safeText(payload.valueString, "No value");
            labs.push({
                name: safeText(payload.code?.text),
                source: row.sourceName,
                date: row.recordedAt,
                status,
                details: value,
            });
        }
        else if (row.resourceType === "AllergyIntolerance") {
            allergies.push({
                name: safeText(payload.code?.text),
                source: row.sourceName,
                date: row.recordedAt,
                status: "active",
                details: safeText(payload.reaction?.[0]?.description, "No reaction details"),
            });
        }
        else if (row.resourceType === "Procedure") {
            procedures.push({
                name: safeText(payload.code?.text),
                source: row.sourceName,
                date: row.recordedAt,
                status,
            });
        }
    }
    return { conditions, medications, labs, allergies, procedures };
}
function buildFallbackSynthesis(aggregated) {
    const conditions = aggregated.conditions ?? [];
    const medications = aggregated.medications ?? [];
    const labs = aggregated.labs ?? [];
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
function buildFallbackRisks(aggregated) {
    const meds = aggregated.medications ?? [];
    const labs = aggregated.labs ?? [];
    const allergies = aggregated.allergies ?? [];
    const risks = [];
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
function buildDeterministicRagResponse(question, matches, fallbackReason) {
    const describeMatch = (match) => {
        const { record } = match;
        const payload = record.payload;
        const date = record.recordedAt;
        const source = record.sourceName;
        if (record.resourceType === "Condition") {
            const condition = safeText(payload.code?.text, "an active condition");
            const status = safeText(payload.clinicalStatus?.text, safeText(payload.status, "active"));
            return `${condition} is documented with ${status} status (${date}, ${source}).`;
        }
        if (record.resourceType === "DiagnosticReport") {
            const reportName = safeText(payload.code?.text, "diagnostic report");
            const conclusion = safeText(payload.conclusion, "no conclusion text is available");
            return `The ${reportName} report from ${source} on ${date} concludes: ${conclusion}.`;
        }
        if (record.resourceType === "Observation") {
            const testName = safeText(payload.code?.text, "observation");
            const quantity = payload.valueQuantity;
            const measuredValue = quantity
                ? `${String(quantity.value ?? "")} ${String(quantity.unit ?? "")}`.trim()
                : safeText(payload.valueString, "no measured value");
            return `${testName} was recorded as ${measuredValue} (${date}, ${source}).`;
        }
        if (record.resourceType === "MedicationRequest") {
            const medication = safeText(payload.medicationCodeableConcept?.text, "medication");
            const dose = safeText(payload.dosageInstruction?.[0]?.text, "dose not specified");
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
    const answer = topMatch && matches[0]
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
function normalizeRagOutput(output, fallbackCaveat) {
    const confidence = output.confidence;
    const normalizedConfidence = confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "medium";
    const answer = typeof output.answer === "string" && output.answer.trim().length > 0
        ? output.answer
        : "Relevant patient records were found. Please review cited entries.";
    const relevantRecords = Array.isArray(output.relevantRecords) ? output.relevantRecords : [];
    const caveat = typeof output.caveat === "string" && output.caveat.trim().length > 0
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
function stripQuestionEcho(answer, question) {
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
function inferQueryFocus(question) {
    const normalized = question.toLowerCase();
    const preferredTypes = [];
    const strictTypes = [];
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
    const topicKeywords = [];
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
function filterMatchesForQuestion(matches, question) {
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
            }
            else {
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
function fallbackAnswerByFocus(question, matches) {
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
            const medication = safeText(payload.medicationCodeableConcept?.text, "Medication");
            const dose = safeText(payload.dosageInstruction?.[0]?.text, "dose not specified");
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
            const allergy = safeText(payload.code?.text, "allergy");
            const reaction = safeText(payload.reaction?.[0]?.description, "reaction not specified");
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
                const reportName = safeText(payload.code?.text, "Diagnostic report");
                const conclusion = safeText(payload.conclusion, "No conclusion text");
                return `${reportName}: ${conclusion}`;
            }
            const testName = safeText(payload.code?.text, "Observation");
            const quantity = payload.valueQuantity;
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
        const condition = safeText(payload.code?.text, "condition");
        const status = safeText(payload.clinicalStatus?.text, safeText(payload.status, "active"));
        return `${condition} (${status})`;
    });
    if (conditionLines.length > 0) {
        return `The patient’s relevant conditions include ${conditionLines.join(", ")}.`;
    }
    return `Most relevant record found: ${top[0]?.content ?? "No details available"}.`;
}
async function storeAgentOutput(patientId, agentName, output, tokensUsed) {
    await (0, neo4j_1.runQuery)(`
    MATCH (p:Patient {id: $patientId})
    CREATE (a:AgentOutput {
      id: $id,
      agentName: $agentName,
      output: $output,
      tokensUsed: $tokensUsed,
      createdAt: $createdAt
    })
    MERGE (p)-[:HAS_AGENT_OUTPUT]->(a)
    `, {
        patientId,
        id: (0, uuid_1.v4)(),
        agentName,
        output: JSON.stringify(output),
        tokensUsed,
        createdAt: new Date().toISOString(),
    });
}
class AgentOrchestrator {
    constructor() {
        this.aggregator = new recordAggregator_1.RecordAggregatorAgent();
        this.synthesizer = new clinicalSynthesizer_1.ClinicalSynthesizerAgent();
        this.riskDetector = new riskDetector_1.RiskDetectorAgent();
        this.ragMemory = new ragMemory_1.RagMemoryAgent();
    }
    async runPipeline(patientId) {
        const failedAgents = [];
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (:Patient {id: $patientId})-[:HAS_SOURCE]->(s:FhirSource)-[:CONTAINS]->(r:FhirResource)
      RETURN r, s
      ORDER BY r.recordedAt ASC
      `, { patientId });
        const fhirRecords = rows.map((row) => ({
            resourceType: String(row.r.resourceType),
            resourceId: String(row.r.resourceId),
            payload: String(row.r.payload),
            recordedAt: String(row.r.recordedAt),
            sourceName: String(row.s.sourceName),
        }));
        const aggregateResult = await this.aggregator.run(fhirRecords);
        const deterministicAggregate = buildFallbackAggregated(fhirRecords);
        let aggregated = aggregateResult.data;
        if (aggregateResult.error) {
            failedAgents.push("recordAggregator");
            aggregated = { ...deterministicAggregate, error: aggregateResult.error, fallbackRecords: fhirRecords };
        }
        await storeAgentOutput(patientId, "recordAggregator", aggregated, aggregateResult.tokensUsed);
        const synthesisResult = await this.synthesizer.run(aggregated);
        let synthesis = synthesisResult.data;
        if (synthesisResult.error) {
            failedAgents.push("clinicalSynthesizer");
            synthesis = { ...buildFallbackSynthesis(aggregated ?? deterministicAggregate), error: synthesisResult.error };
        }
        await storeAgentOutput(patientId, "clinicalSynthesizer", synthesis, synthesisResult.tokensUsed);
        const riskResult = await this.riskDetector.run({
            aggregated,
            medications: aggregated?.medications ?? [],
        });
        let risks = riskResult.data;
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
    async runRagQuery(patientId, question) {
        try {
            const rows = await (0, neo4j_1.runQuery)(`
        MATCH (:Patient {id: $patientId})-[:HAS_SOURCE]->(s:FhirSource)-[:CONTAINS]->(r:FhirResource)
        RETURN r, s
        ORDER BY r.recordedAt ASC
        `, { patientId });
            const records = rows.map((row) => ({
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
            const ragData = ragResult.data;
            const hasUsableAnswer = typeof ragData?.answer === "string" && ragData.answer.trim().length > 0;
            const output = hasUsableAnswer
                ? normalizeRagOutput(ragData, ragResult.error ? `Model warning: ${ragResult.error}` : undefined)
                : buildDeterministicRagResponse(question, focusedRetrieved, ragResult.error ?? "rag_failed");
            if (typeof output.answer === "string") {
                output.answer = stripQuestionEcho(output.answer, question);
            }
            try {
                await storeAgentOutput(patientId, "ragMemory", output, ragResult.tokensUsed);
            }
            catch (error) {
                if (process.env.NODE_ENV === "development") {
                    // eslint-disable-next-line no-console
                    console.warn("Failed to persist rag output:", error.message);
                }
            }
            return output;
        }
        catch (error) {
            return {
                answer: "Unable to process query right now. Please retry in a moment.",
                confidence: "low",
                relevantRecords: [],
                caveat: `RAG pipeline fallback: ${error.message}`,
            };
        }
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
