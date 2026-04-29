"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryVectorMemory = void 0;
const EMBEDDING_DIMENSION = 256;
const SYNONYM_MAP = {
    cardiac: ["heart", "cardio", "cardiovascular", "ecg", "echo"],
    condition: ["diagnosis", "disease", "problem", "status"],
    medication: ["drug", "medicine", "prescription", "tablet"],
    allergy: ["allergic", "hypersensitivity", "reaction"],
    scan: ["imaging", "report", "diagnostic"],
    result: ["finding", "observation", "value", "impression"],
    kidney: ["renal", "egfr", "creatinine"],
    diabetes: ["hba1c", "glucose", "glycemic"],
};
function normalizeText(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}
function tokenize(text) {
    return normalizeText(text)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1);
}
function fnv1a(input) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}
function buildEmbedding(text) {
    const vector = Array.from({ length: EMBEDDING_DIMENSION }, () => 0);
    const tokens = tokenize(text);
    if (tokens.length === 0) {
        return vector;
    }
    const frequencies = new Map();
    for (const token of tokens) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    for (const [token, frequency] of frequencies.entries()) {
        const indexHash = fnv1a(token);
        const signHash = fnv1a(`sign:${token}`);
        const bucket = indexHash % EMBEDDING_DIMENSION;
        const sign = signHash % 2 === 0 ? 1 : -1;
        vector[bucket] = (vector[bucket] ?? 0) + sign * frequency;
    }
    let magnitude = 0;
    for (const value of vector) {
        magnitude += value * value;
    }
    magnitude = Math.sqrt(magnitude);
    if (magnitude === 0) {
        return vector;
    }
    return vector.map((value) => value / magnitude);
}
function cosineSimilarity(left, right) {
    if (left.length !== right.length || left.length === 0) {
        return 0;
    }
    let dotProduct = 0;
    for (let index = 0; index < left.length; index += 1) {
        dotProduct += (left[index] ?? 0) * (right[index] ?? 0);
    }
    return dotProduct;
}
function safeText(value, fallback = "") {
    return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}
function summarizeRecord(record) {
    const payload = record.payload;
    const resourceType = record.resourceType;
    if (resourceType === "Condition") {
        const code = safeText(payload.code?.text, "Condition");
        const status = safeText(payload.clinicalStatus?.text, safeText(payload.status, "active"));
        return `${code} (${status})`;
    }
    if (resourceType === "DiagnosticReport") {
        const reportName = safeText(payload.code?.text, "Diagnostic report");
        const conclusion = safeText(payload.conclusion, "No conclusion provided");
        return `${reportName}: ${conclusion}`;
    }
    if (resourceType === "Observation") {
        const observationName = safeText(payload.code?.text, "Observation");
        const quantity = payload.valueQuantity;
        const measuredValue = quantity
            ? `${String(quantity.value ?? "")} ${String(quantity.unit ?? "")}`.trim()
            : safeText(payload.valueString, "No value");
        return `${observationName}: ${measuredValue}`;
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
    return JSON.stringify(payload).slice(0, 320);
}
function recordToDocument(record) {
    const payload = record.payload;
    const summary = summarizeRecord(record);
    const coreFields = [
        record.resourceType,
        record.sourceName,
        summary,
        safeText(payload.code?.text),
        safeText(payload.conclusion),
        safeText(payload.valueString),
        safeText(payload.note?.[0]?.text),
    ];
    return coreFields.filter((part) => part.trim().length > 0).join(" | ");
}
function expandQueryTokens(tokens) {
    const expanded = new Set(tokens);
    for (const token of tokens) {
        for (const synonym of SYNONYM_MAP[token] ?? []) {
            expanded.add(synonym);
        }
    }
    return Array.from(expanded);
}
function inferIntent(tokens) {
    return {
        wantsCondition: tokens.has("condition") || tokens.has("diagnosis") || tokens.has("disease") || tokens.has("problem"),
        wantsMedication: tokens.has("medication") || tokens.has("medicine") || tokens.has("drug") || tokens.has("tablet"),
        wantsLabOrResult: tokens.has("lab") || tokens.has("result") || tokens.has("scan") || tokens.has("observation") || tokens.has("report"),
        wantsAllergy: tokens.has("allergy") || tokens.has("allergic") || tokens.has("reaction"),
        wantsCardiac: tokens.has("cardiac") || tokens.has("heart") || tokens.has("cardio") || tokens.has("ecg") || tokens.has("echo"),
    };
}
function computeIntentBoost(intent, record, content) {
    let boost = 0;
    const type = record.resourceType;
    const normalizedContent = normalizeText(content);
    if (intent.wantsCondition && type === "Condition") {
        boost += 0.2;
    }
    if (intent.wantsMedication && type === "MedicationRequest") {
        boost += 0.2;
    }
    if (intent.wantsLabOrResult && (type === "Observation" || type === "DiagnosticReport")) {
        boost += 0.2;
    }
    if (intent.wantsAllergy && type === "AllergyIntolerance") {
        boost += 0.25;
    }
    if (intent.wantsCardiac && /(cardiac|heart|cardio|ecg|echo|hypertension)/.test(normalizedContent)) {
        boost += 0.25;
    }
    return boost;
}
function computeSignature(records) {
    return records
        .map((record) => `${record.resourceId}:${record.recordedAt}`)
        .sort()
        .join(";");
}
class InMemoryVectorMemory {
    constructor() {
        this.patientIndexes = new Map();
    }
    buildIndex(records) {
        return records.map((record) => {
            const content = recordToDocument(record);
            return {
                record,
                content,
                embedding: buildEmbedding(content),
                tokens: new Set(tokenize(content)),
            };
        });
    }
    ensurePatientIndex(patientId, records) {
        const signature = computeSignature(records);
        const existing = this.patientIndexes.get(patientId);
        if (existing && existing.signature === signature) {
            return existing;
        }
        const rebuilt = {
            signature,
            records: this.buildIndex(records),
        };
        this.patientIndexes.set(patientId, rebuilt);
        return rebuilt;
    }
    search(patientId, records, query, limit = 6) {
        const patientIndex = this.ensurePatientIndex(patientId, records);
        const queryTokens = tokenize(query);
        const expandedQueryTokens = expandQueryTokens(queryTokens);
        const queryTokenSet = new Set(expandedQueryTokens);
        const queryEmbedding = buildEmbedding(expandedQueryTokens.join(" "));
        const intent = inferIntent(queryTokenSet);
        const lexicalDenominator = Math.max(expandedQueryTokens.length, 1);
        const scored = patientIndex.records
            .map((indexedRecord) => {
            const vectorScore = cosineSimilarity(queryEmbedding, indexedRecord.embedding);
            let lexicalHits = 0;
            for (const token of queryTokenSet) {
                if (indexedRecord.tokens.has(token)) {
                    lexicalHits += 1;
                }
            }
            const lexicalScore = lexicalHits / lexicalDenominator;
            const intentBoost = computeIntentBoost(intent, indexedRecord.record, indexedRecord.content);
            const finalScore = vectorScore * 0.75 + lexicalScore * 0.45 + intentBoost;
            return {
                score: finalScore,
                content: indexedRecord.content,
                record: indexedRecord.record,
            };
        })
            .sort((left, right) => right.score - left.score);
        const positive = scored.filter((item) => item.score > 0).slice(0, limit);
        if (positive.length > 0) {
            return positive;
        }
        return scored.slice(0, Math.min(limit, scored.length));
    }
}
exports.InMemoryVectorMemory = InMemoryVectorMemory;
