"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentOrchestrator = void 0;
const uuid_1 = require("uuid");
const neo4j_1 = require("../db/neo4j");
const clinicalSynthesizer_1 = require("./clinicalSynthesizer");
const ragMemory_1 = require("./ragMemory");
const recordAggregator_1 = require("./recordAggregator");
const riskDetector_1 = require("./riskDetector");
function safeText(value, fallback = "Unknown") {
    return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}
function buildFallbackAggregated(fhirRecords) {
    const conditions = [];
    const medications = [];
    const labs = [];
    const allergies = [];
    const procedures = [];
    for (const row of fhirRecords) {
        const payload = JSON.parse(row.payload);
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
function normalizeText(input) {
    return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}
function tokenize(input) {
    return normalizeText(input)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1);
}
function levenshteinDistance(left, right) {
    if (left === right) {
        return 0;
    }
    if (left.length === 0) {
        return right.length;
    }
    if (right.length === 0) {
        return left.length;
    }
    const previousRow = Array.from({ length: right.length + 1 }, (_value, index) => index);
    let currentRow = Array.from({ length: right.length + 1 }, () => 0);
    for (let row = 1; row <= left.length; row += 1) {
        currentRow[0] = row;
        for (let col = 1; col <= right.length; col += 1) {
            const cost = left[row - 1] === right[col - 1] ? 0 : 1;
            const deletion = previousRow[col] ?? Number.MAX_SAFE_INTEGER;
            const insertion = currentRow[col - 1] ?? Number.MAX_SAFE_INTEGER;
            const substitution = previousRow[col - 1] ?? Number.MAX_SAFE_INTEGER;
            currentRow[col] = Math.min(deletion + 1, insertion + 1, substitution + cost);
        }
        for (let col = 0; col <= right.length; col += 1) {
            previousRow[col] = currentRow[col] ?? previousRow[col] ?? 0;
        }
    }
    return previousRow[right.length] ?? 0;
}
function approximatelyMatches(queryToken, candidateToken) {
    if (queryToken === candidateToken) {
        return true;
    }
    if (queryToken.length < 4 || candidateToken.length < 4) {
        return false;
    }
    const distance = levenshteinDistance(queryToken, candidateToken);
    if (Math.max(queryToken.length, candidateToken.length) >= 8) {
        return distance <= 2;
    }
    return distance <= 1;
}
const CARDIAC_KEYWORDS = [
    "cardiac",
    "cadiac",
    "cardio",
    "heart",
    "coronary",
    "cad",
    "stent",
    "ecg",
    "ekg",
    "echo",
    "cardiopulmonary",
    "ldl",
];
const REPORT_KEYWORDS = ["report", "scan", "result", "results", "imaging", "conclusion", "finding"];
function containsApproxKeyword(tokens, keywords) {
    return tokens.some((token) => keywords.some((keyword) => approximatelyMatches(token, keyword) || token.includes(keyword)));
}
function getRecordSummary(record) {
    const resourceType = String(record.resourceType ?? "");
    const payload = record.payload;
    if (resourceType === "Condition") {
        const code = safeText(payload.code?.text, "Condition");
        const status = safeText(payload.clinicalStatus?.text, safeText(payload.status, "active"));
        return `${code} (${status})`;
    }
    if (resourceType === "DiagnosticReport") {
        const code = safeText(payload.code?.text, "Diagnostic report");
        const conclusion = safeText(payload.conclusion, "No conclusion provided");
        return `${code}: ${conclusion}`;
    }
    if (resourceType === "Observation") {
        const code = safeText(payload.code?.text, "Observation");
        const quantity = payload.valueQuantity;
        const valueText = quantity
            ? `${String(quantity.value ?? "")} ${String(quantity.unit ?? "")}`.trim()
            : safeText(payload.valueString, "No value");
        const note = safeText(payload.note?.[0]?.text, "");
        return note ? `${code}: ${valueText}. Note: ${note}` : `${code}: ${valueText}`;
    }
    if (resourceType === "MedicationRequest") {
        const medication = safeText(payload.medicationCodeableConcept?.text, "Medication");
        const dose = safeText(payload.dosageInstruction?.[0]?.text, "No dose");
        return `${medication} (${dose})`;
    }
    if (resourceType === "AllergyIntolerance") {
        const allergy = safeText(payload.code?.text, "Allergy");
        const reaction = safeText(payload.reaction?.[0]?.description, "No reaction details");
        return `${allergy}: ${reaction}`;
    }
    if (resourceType === "Procedure") {
        return safeText(payload.code?.text, "Procedure");
    }
    return JSON.stringify(payload).slice(0, 280);
}
function buildSearchTokens(record) {
    const payload = record.payload;
    const textParts = [
        String(record.resourceType ?? ""),
        String(record.sourceName ?? ""),
        safeText(payload.code?.text, ""),
        safeText(payload.medicationCodeableConcept?.text, ""),
        safeText(payload.conclusion, ""),
        safeText(payload.valueString, ""),
        safeText(payload.clinicalStatus?.text, ""),
        safeText(payload.reaction?.[0]?.description, ""),
        safeText(payload.note?.[0]?.text, ""),
        JSON.stringify(payload),
    ];
    return tokenize(textParts.join(" "));
}
function buildFallbackAnswer(question, relevant) {
    if (relevant.length === 0) {
        return `I could not find a direct match for "${question}" in the available records.`;
    }
    const diagnosticReports = relevant.filter((item) => item.type === "DiagnosticReport");
    const conditions = relevant.filter((item) => item.type === "Condition");
    const observations = relevant.filter((item) => item.type === "Observation");
    if (diagnosticReports.length > 0) {
        const topReport = diagnosticReports[0]?.content ?? "";
        return `Based on the chart, the most relevant report is: ${topReport}`;
    }
    if (conditions.length > 0 || observations.length > 0) {
        const conditionText = conditions.slice(0, 2).map((item) => item.content).join("; ");
        const observationText = observations.slice(0, 2).map((item) => item.content).join("; ");
        if (conditionText && observationText) {
            return `Relevant findings: conditions - ${conditionText}. Related observations - ${observationText}.`;
        }
        return `Relevant findings: ${conditionText || observationText}.`;
    }
    return `I found relevant records for "${question}": ${relevant
        .slice(0, 3)
        .map((item) => item.content)
        .join("; ")}.`;
}
function buildFallbackRagResponse(question, records, ragError) {
    const queryTokens = tokenize(question);
    const queryIsCardiac = containsApproxKeyword(queryTokens, CARDIAC_KEYWORDS);
    const queryRequestsReport = containsApproxKeyword(queryTokens, REPORT_KEYWORDS);
    const scored = records
        .map((record) => {
        const recordTokens = buildSearchTokens(record);
        const recordTokenSet = new Set(recordTokens);
        let score = 0;
        for (const token of queryTokens) {
            if (recordTokenSet.has(token)) {
                score += 3;
                continue;
            }
            if (recordTokens.some((candidate) => approximatelyMatches(token, candidate))) {
                score += 2;
            }
        }
        if (queryIsCardiac && containsApproxKeyword(recordTokens, CARDIAC_KEYWORDS)) {
            score += 4;
        }
        const resourceType = String(record.resourceType ?? "");
        if (queryRequestsReport && resourceType === "DiagnosticReport") {
            score += 3;
        }
        return { record, score };
    })
        .sort((left, right) => right.score - left.score);
    let relevant = scored
        .filter((entry) => entry.score > 0)
        .slice(0, 6)
        .map((entry) => ({
        date: String(entry.record.recordedAt ?? ""),
        source: String(entry.record.sourceName ?? "Unknown"),
        type: String(entry.record.resourceType ?? "Unknown"),
        content: getRecordSummary(entry.record),
    }));
    if (relevant.length === 0) {
        const mostRecent = records.slice(-5).reverse();
        for (const record of mostRecent) {
            relevant.push({
                date: String(record.recordedAt ?? ""),
                source: String(record.sourceName ?? "Unknown"),
                type: String(record.resourceType ?? "Unknown"),
                content: getRecordSummary(record),
            });
        }
    }
    if (queryIsCardiac) {
        const cardiacOnly = relevant.filter((item) => containsApproxKeyword(tokenize(`${item.type} ${item.content}`), CARDIAC_KEYWORDS));
        if (cardiacOnly.length > 0) {
            relevant = cardiacOnly.slice(0, 5);
        }
    }
    const caveat = ragError
        ? `Generated from deterministic fallback because model output failed: ${ragError}`
        : "Generated from deterministic fallback.";
    return {
        answer: buildFallbackAnswer(question, relevant),
        relevantRecords: relevant,
        confidence: relevant.length >= 3 ? "high" : relevant.length > 0 ? "medium" : "low",
        caveat,
    };
}
function normalizeRagOutput(output, fallbackCaveat) {
    const confidence = output.confidence;
    const normalizedConfidence = confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "medium";
    const relevantRecords = Array.isArray(output.relevantRecords) ? output.relevantRecords : [];
    const answer = typeof output.answer === "string" && output.answer.trim().length > 0
        ? output.answer
        : "Relevant records were found. Please review the cited entries.";
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
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (:Patient {id: $patientId})-[:HAS_SOURCE]->(s:FhirSource)-[:CONTAINS]->(r:FhirResource)
      RETURN r, s
      ORDER BY r.recordedAt ASC
      `, { patientId });
        const records = rows.map((row) => ({
            resourceType: row.r.resourceType,
            resourceId: row.r.resourceId,
            recordedAt: row.r.recordedAt,
            sourceName: row.s.sourceName,
            payload: JSON.parse(String(row.r.payload)),
        }));
        const payload = {
            question,
            records,
        };
        const ragResult = await this.ragMemory.run(payload);
        const ragData = ragResult.data;
        const hasUsableAnswer = typeof ragData?.answer === "string" && ragData.answer.trim().length > 0;
        const output = hasUsableAnswer
            ? normalizeRagOutput(ragData, ragResult.error ? `Model warning: ${ragResult.error}` : undefined)
            : buildFallbackRagResponse(question, records, ragResult.error);
        await storeAgentOutput(patientId, "ragMemory", output, ragResult.tokensUsed);
        return output;
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
