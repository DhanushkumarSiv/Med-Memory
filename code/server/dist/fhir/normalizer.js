"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFhirRows = normalizeFhirRows;
function safeValue(value, fallback) {
    return value !== undefined && value !== null ? value : fallback;
}
function toRecord(payloadRaw, resourceType, source, date, id) {
    const payload = JSON.parse(payloadRaw);
    const code = safeValue(payload.code?.text, "Unknown");
    const status = safeValue(payload.status, safeValue(payload.clinicalStatus?.text, "unknown"));
    if (resourceType === "MedicationRequest") {
        const med = safeValue(payload.medicationCodeableConcept?.text, "Unknown medication");
        const dose = safeValue(payload.dosageInstruction?.[0]?.text, "No dose");
        return { id, type: "Medication", title: med, status: String(status), source, date, details: String(dose) };
    }
    if (resourceType === "Observation") {
        const valueQuantity = payload.valueQuantity;
        const valueString = safeValue(payload.valueString, "");
        const value = valueQuantity ? `${safeValue(valueQuantity.value, "")}${safeValue(valueQuantity.unit, "")}` : String(valueString);
        return { id, type: "Lab", title: String(code), status: String(status), source, date, details: value };
    }
    if (resourceType === "AllergyIntolerance") {
        const reaction = safeValue(payload.reaction?.[0]?.description, "No reaction details");
        return { id, type: "Allergy", title: String(code), status: "active", source, date, details: String(reaction) };
    }
    if (resourceType === "Procedure") {
        return { id, type: "Procedure", title: String(code), status: String(status), source, date, details: "" };
    }
    return { id, type: "Condition", title: String(code), status: String(status), source, date, details: "" };
}
function normalizeFhirRows(rows) {
    const summary = {
        conditions: [],
        medications: [],
        labs: [],
        allergies: [],
        procedures: [],
        timeline: [],
    };
    for (const row of rows) {
        const normalized = toRecord(row.payload, row.resourceType, row.sourceName, row.recordedAt, row.resourceId);
        switch (row.resourceType) {
            case "Condition":
                summary.conditions.push(normalized);
                break;
            case "MedicationRequest":
                summary.medications.push(normalized);
                break;
            case "Observation":
                summary.labs.push(normalized);
                break;
            case "AllergyIntolerance":
                summary.allergies.push(normalized);
                break;
            case "Procedure":
                summary.procedures.push(normalized);
                break;
            default:
                break;
        }
        if (row.resourceType !== "Patient" && row.resourceType !== "DiagnosticReport") {
            summary.timeline.push(normalized);
        }
    }
    summary.timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return summary;
}
