interface NormalizedRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  source: string;
  date: string;
  details: string;
}

export interface NormalizedFhirSummary {
  conditions: NormalizedRecord[];
  medications: NormalizedRecord[];
  labs: NormalizedRecord[];
  allergies: NormalizedRecord[];
  procedures: NormalizedRecord[];
  timeline: NormalizedRecord[];
}

function safeValue<T>(value: unknown, fallback: T): T {
  return value !== undefined && value !== null ? (value as T) : fallback;
}

function toRecord(payloadRaw: string, resourceType: string, source: string, date: string, id: string): NormalizedRecord {
  const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
  const code = safeValue((payload.code as Record<string, unknown> | undefined)?.text, "Unknown");
  const status = safeValue(payload.status, safeValue((payload.clinicalStatus as Record<string, unknown> | undefined)?.text, "unknown"));

  if (resourceType === "MedicationRequest") {
    const med = safeValue(
      (payload.medicationCodeableConcept as Record<string, unknown> | undefined)?.text,
      "Unknown medication"
    );
    const dose = safeValue(
      (payload.dosageInstruction as Array<Record<string, unknown>> | undefined)?.[0]?.text,
      "No dose"
    );
    return { id, type: "Medication", title: med, status: String(status), source, date, details: String(dose) };
  }

  if (resourceType === "Observation") {
    const valueQuantity = payload.valueQuantity as Record<string, unknown> | undefined;
    const valueString = safeValue(payload.valueString, "");
    const value = valueQuantity ? `${safeValue(valueQuantity.value, "")}${safeValue(valueQuantity.unit, "")}` : String(valueString);
    return { id, type: "Lab", title: String(code), status: String(status), source, date, details: value };
  }

  if (resourceType === "AllergyIntolerance") {
    const reaction = safeValue(
      (payload.reaction as Array<Record<string, unknown>> | undefined)?.[0]?.description,
      "No reaction details"
    );
    return { id, type: "Allergy", title: String(code), status: "active", source, date, details: String(reaction) };
  }

  if (resourceType === "Procedure") {
    return { id, type: "Procedure", title: String(code), status: String(status), source, date, details: "" };
  }

  return { id, type: "Condition", title: String(code), status: String(status), source, date, details: "" };
}

export function normalizeFhirRows(
  rows: Array<{ resourceId: string; resourceType: string; payload: string; recordedAt: string; sourceName: string }>
): NormalizedFhirSummary {
  const summary: NormalizedFhirSummary = {
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
