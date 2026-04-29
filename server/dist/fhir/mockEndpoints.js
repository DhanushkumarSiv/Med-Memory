"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockPatientRecords = void 0;
exports.getFhirPatientByAbhaId = getFhirPatientByAbhaId;
exports.getFhirBundleByAbhaId = getFhirBundleByAbhaId;
const priyaSources = [
    {
        id: "apollo-chennai",
        sourceName: "Apollo Hospital Chennai",
        sourceType: "hospital",
        fhirBaseUrl: "https://apollo-chennai.fhir.mock",
    },
    {
        id: "srl-diagnostics",
        sourceName: "SRL Diagnostics",
        sourceType: "lab",
        fhirBaseUrl: "https://srl.fhir.mock",
    },
    {
        id: "wellness-pharmacy",
        sourceName: "Wellness Pharmacy",
        sourceType: "pharmacy",
        fhirBaseUrl: "https://wellness-pharmacy.fhir.mock",
    },
];
const rajanSources = [
    {
        id: "kokilaben-mumbai",
        sourceName: "Kokilaben Hospital Mumbai",
        sourceType: "hospital",
        fhirBaseUrl: "https://kokilaben.fhir.mock",
    },
    {
        id: "lilavati-mumbai",
        sourceName: "Lilavati Hospital",
        sourceType: "hospital",
        fhirBaseUrl: "https://lilavati.fhir.mock",
    },
    {
        id: "pathlabs-mumbai",
        sourceName: "PathLabs Mumbai",
        sourceType: "lab",
        fhirBaseUrl: "https://pathlabs.fhir.mock",
    },
];
const priyaResources = [
    {
        resourceType: "Patient",
        resourceId: "patient-priya",
        sourceId: "apollo-chennai",
        recordedAt: "2024-01-10",
        payload: {
            resourceType: "Patient",
            id: "patient-priya",
            identifier: [{ system: "https://abdm.gov.in/abha", value: "ABHA-1001-2024" }],
            name: [{ text: "Priya Sharma" }],
            gender: "female",
            birthDate: "1974-02-12",
            address: [{ city: "Chennai" }],
            telecom: [{ system: "phone", value: "+919876540001" }],
        },
    },
    {
        resourceType: "Condition",
        resourceId: "cond-priya-t2dm",
        sourceId: "apollo-chennai",
        recordedAt: "2018-05-10",
        payload: {
            resourceType: "Condition",
            id: "cond-priya-t2dm",
            code: { text: "Type 2 Diabetes Mellitus" },
            clinicalStatus: { text: "active" },
            onsetDateTime: "2018-05-10",
        },
    },
    {
        resourceType: "Condition",
        resourceId: "cond-priya-htn",
        sourceId: "apollo-chennai",
        recordedAt: "2020-08-22",
        payload: {
            resourceType: "Condition",
            id: "cond-priya-htn",
            code: { text: "Hypertension" },
            clinicalStatus: { text: "active" },
            onsetDateTime: "2020-08-22",
        },
    },
    {
        resourceType: "Condition",
        resourceId: "cond-priya-ckd",
        sourceId: "apollo-chennai",
        recordedAt: "2023-03-12",
        payload: {
            resourceType: "Condition",
            id: "cond-priya-ckd",
            code: { text: "Chronic Kidney Disease Stage 1" },
            clinicalStatus: { text: "active" },
            onsetDateTime: "2023-03-12",
        },
    },
    {
        resourceType: "MedicationRequest",
        resourceId: "med-priya-metformin",
        sourceId: "wellness-pharmacy",
        recordedAt: "2024-12-10",
        payload: {
            resourceType: "MedicationRequest",
            id: "med-priya-metformin",
            status: "active",
            medicationCodeableConcept: { text: "Metformin 500mg" },
            dosageInstruction: [{ text: "1 tablet twice daily" }],
        },
    },
    {
        resourceType: "MedicationRequest",
        resourceId: "med-priya-amlodipine",
        sourceId: "wellness-pharmacy",
        recordedAt: "2024-12-10",
        payload: {
            resourceType: "MedicationRequest",
            id: "med-priya-amlodipine",
            status: "active",
            medicationCodeableConcept: { text: "Amlodipine 5mg" },
            dosageInstruction: [{ text: "1 tablet once daily" }],
        },
    },
    {
        resourceType: "MedicationRequest",
        resourceId: "med-priya-empagliflozin",
        sourceId: "wellness-pharmacy",
        recordedAt: "2024-12-10",
        payload: {
            resourceType: "MedicationRequest",
            id: "med-priya-empagliflozin",
            status: "active",
            medicationCodeableConcept: { text: "Empagliflozin 10mg" },
            dosageInstruction: [{ text: "1 tablet once daily" }],
        },
    },
    {
        resourceType: "Observation",
        resourceId: "obs-priya-hba1c",
        sourceId: "srl-diagnostics",
        recordedAt: "2025-01-04",
        payload: {
            resourceType: "Observation",
            id: "obs-priya-hba1c",
            status: "final",
            code: { text: "HbA1c" },
            valueQuantity: { value: 8.2, unit: "%" },
            effectiveDateTime: "2025-01-04",
        },
    },
    {
        resourceType: "Observation",
        resourceId: "obs-priya-egfr",
        sourceId: "srl-diagnostics",
        recordedAt: "2025-01-04",
        payload: {
            resourceType: "Observation",
            id: "obs-priya-egfr",
            status: "final",
            code: { text: "eGFR" },
            valueQuantity: { value: 58, unit: "mL/min/1.73m2" },
            effectiveDateTime: "2025-01-04",
            note: [{ text: "Prior eGFR 72 in 2023" }],
        },
    },
    {
        resourceType: "Observation",
        resourceId: "obs-priya-bp",
        sourceId: "apollo-chennai",
        recordedAt: "2025-01-03",
        payload: {
            resourceType: "Observation",
            id: "obs-priya-bp",
            status: "final",
            code: { text: "Blood Pressure" },
            valueString: "148/92",
            effectiveDateTime: "2025-01-03",
        },
    },
    {
        resourceType: "AllergyIntolerance",
        resourceId: "alg-priya-penicillin",
        sourceId: "apollo-chennai",
        recordedAt: "2021-04-15",
        payload: {
            resourceType: "AllergyIntolerance",
            id: "alg-priya-penicillin",
            code: { text: "Penicillin" },
            criticality: "high",
            reaction: [{ description: "Anaphylaxis" }],
        },
    },
    {
        resourceType: "DiagnosticReport",
        resourceId: "dr-priya-renal",
        sourceId: "srl-diagnostics",
        recordedAt: "2025-01-05",
        payload: {
            resourceType: "DiagnosticReport",
            id: "dr-priya-renal",
            status: "final",
            code: { text: "Renal function panel" },
            conclusion: "Mild decline in kidney function, monitor progression.",
        },
    },
];
const rajanResources = [
    {
        resourceType: "Patient",
        resourceId: "patient-rajan",
        sourceId: "kokilaben-mumbai",
        recordedAt: "2024-02-11",
        payload: {
            resourceType: "Patient",
            id: "patient-rajan",
            identifier: [{ system: "https://abdm.gov.in/abha", value: "ABHA-2042-2024" }],
            name: [{ text: "Rajan Mehta" }],
            gender: "male",
            birthDate: "1956-09-22",
            address: [{ city: "Mumbai" }],
            telecom: [{ system: "phone", value: "+919876540002" }],
        },
    },
    {
        resourceType: "Condition",
        resourceId: "cond-rajan-cad",
        sourceId: "kokilaben-mumbai",
        recordedAt: "2019-07-20",
        payload: {
            resourceType: "Condition",
            id: "cond-rajan-cad",
            code: { text: "Coronary Artery Disease with stent" },
            clinicalStatus: { text: "active" },
            onsetDateTime: "2019-07-20",
        },
    },
    {
        resourceType: "Condition",
        resourceId: "cond-rajan-copd",
        sourceId: "lilavati-mumbai",
        recordedAt: "2021-06-01",
        payload: {
            resourceType: "Condition",
            id: "cond-rajan-copd",
            code: { text: "COPD" },
            clinicalStatus: { text: "active" },
            onsetDateTime: "2021-06-01",
        },
    },
    {
        resourceType: "Condition",
        resourceId: "cond-rajan-diabetes",
        sourceId: "kokilaben-mumbai",
        recordedAt: "2015-03-12",
        payload: {
            resourceType: "Condition",
            id: "cond-rajan-diabetes",
            code: { text: "Type 2 Diabetes Mellitus" },
            clinicalStatus: { text: "active" },
            onsetDateTime: "2015-03-12",
        },
    },
    {
        resourceType: "Condition",
        resourceId: "cond-rajan-gout",
        sourceId: "lilavati-mumbai",
        recordedAt: "2022-10-08",
        payload: {
            resourceType: "Condition",
            id: "cond-rajan-gout",
            code: { text: "Gout" },
            clinicalStatus: { text: "active" },
            onsetDateTime: "2022-10-08",
        },
    },
    {
        resourceType: "MedicationRequest",
        resourceId: "med-rajan-aspirin",
        sourceId: "kokilaben-mumbai",
        recordedAt: "2024-11-02",
        payload: {
            resourceType: "MedicationRequest",
            id: "med-rajan-aspirin",
            status: "active",
            medicationCodeableConcept: { text: "Aspirin 75mg" },
            dosageInstruction: [{ text: "Once daily" }],
        },
    },
    {
        resourceType: "MedicationRequest",
        resourceId: "med-rajan-atorvastatin",
        sourceId: "kokilaben-mumbai",
        recordedAt: "2024-11-02",
        payload: {
            resourceType: "MedicationRequest",
            id: "med-rajan-atorvastatin",
            status: "active",
            medicationCodeableConcept: { text: "Atorvastatin 40mg" },
            dosageInstruction: [{ text: "Nightly" }],
        },
    },
    {
        resourceType: "MedicationRequest",
        resourceId: "med-rajan-metformin",
        sourceId: "kokilaben-mumbai",
        recordedAt: "2024-11-02",
        payload: {
            resourceType: "MedicationRequest",
            id: "med-rajan-metformin",
            status: "active",
            medicationCodeableConcept: { text: "Metformin 500mg" },
            dosageInstruction: [{ text: "Twice daily" }],
        },
    },
    {
        resourceType: "MedicationRequest",
        resourceId: "med-rajan-salbutamol",
        sourceId: "lilavati-mumbai",
        recordedAt: "2024-11-02",
        payload: {
            resourceType: "MedicationRequest",
            id: "med-rajan-salbutamol",
            status: "active",
            medicationCodeableConcept: { text: "Salbutamol inhaler" },
            dosageInstruction: [{ text: "As needed" }],
        },
    },
    {
        resourceType: "MedicationRequest",
        resourceId: "med-rajan-allopurinol",
        sourceId: "lilavati-mumbai",
        recordedAt: "2024-11-02",
        payload: {
            resourceType: "MedicationRequest",
            id: "med-rajan-allopurinol",
            status: "active",
            medicationCodeableConcept: { text: "Allopurinol 100mg" },
            dosageInstruction: [{ text: "Once daily" }],
        },
    },
    {
        resourceType: "MedicationRequest",
        resourceId: "med-rajan-pantoprazole",
        sourceId: "lilavati-mumbai",
        recordedAt: "2024-11-02",
        payload: {
            resourceType: "MedicationRequest",
            id: "med-rajan-pantoprazole",
            status: "active",
            medicationCodeableConcept: { text: "Pantoprazole 40mg" },
            dosageInstruction: [{ text: "Once daily" }],
        },
    },
    {
        resourceType: "Observation",
        resourceId: "obs-rajan-ldl",
        sourceId: "pathlabs-mumbai",
        recordedAt: "2025-01-08",
        payload: {
            resourceType: "Observation",
            id: "obs-rajan-ldl",
            status: "final",
            code: { text: "LDL" },
            valueQuantity: { value: 112, unit: "mg/dL" },
            effectiveDateTime: "2025-01-08",
        },
    },
    {
        resourceType: "Observation",
        resourceId: "obs-rajan-fev1",
        sourceId: "pathlabs-mumbai",
        recordedAt: "2025-01-08",
        payload: {
            resourceType: "Observation",
            id: "obs-rajan-fev1",
            status: "final",
            code: { text: "FEV1" },
            valueQuantity: { value: 58, unit: "%" },
            effectiveDateTime: "2025-01-08",
        },
    },
    {
        resourceType: "Observation",
        resourceId: "obs-rajan-uric",
        sourceId: "pathlabs-mumbai",
        recordedAt: "2025-01-08",
        payload: {
            resourceType: "Observation",
            id: "obs-rajan-uric",
            status: "final",
            code: { text: "Uric Acid" },
            valueQuantity: { value: 7.8, unit: "mg/dL" },
            effectiveDateTime: "2025-01-08",
        },
    },
    {
        resourceType: "AllergyIntolerance",
        resourceId: "alg-rajan-sulfa",
        sourceId: "lilavati-mumbai",
        recordedAt: "2020-01-12",
        payload: {
            resourceType: "AllergyIntolerance",
            id: "alg-rajan-sulfa",
            code: { text: "Sulfa drugs" },
            criticality: "high",
            reaction: [{ description: "Severe rash" }],
        },
    },
    {
        resourceType: "AllergyIntolerance",
        resourceId: "alg-rajan-nsaid",
        sourceId: "kokilaben-mumbai",
        recordedAt: "2022-10-15",
        payload: {
            resourceType: "AllergyIntolerance",
            id: "alg-rajan-nsaid",
            code: { text: "NSAIDs" },
            criticality: "high",
            reaction: [{ description: "GI bleed history" }],
        },
    },
    {
        resourceType: "DiagnosticReport",
        resourceId: "dr-rajan-cardiopulmonary",
        sourceId: "kokilaben-mumbai",
        recordedAt: "2025-01-09",
        payload: {
            resourceType: "DiagnosticReport",
            id: "dr-rajan-cardiopulmonary",
            status: "final",
            code: { text: "Cardiopulmonary review" },
            conclusion: "LDL remains above post-stent target; COPD stable with reduced lung function.",
        },
    },
];
exports.mockPatientRecords = [
    {
        abhaId: "ABHA-1001-2024",
        name: "Priya Sharma",
        dob: "1974-02-12",
        gender: "female",
        phone: "+919876540001",
        city: "Chennai",
        sources: priyaSources,
        resources: priyaResources,
    },
    {
        abhaId: "ABHA-2042-2024",
        name: "Rajan Mehta",
        dob: "1956-09-22",
        gender: "male",
        phone: "+919876540002",
        city: "Mumbai",
        sources: rajanSources,
        resources: rajanResources,
    },
];
function getFhirPatientByAbhaId(abhaId) {
    const match = exports.mockPatientRecords.find((record) => record.abhaId === abhaId);
    if (!match) {
        return null;
    }
    return match.resources.find((resource) => resource.resourceType === "Patient")?.payload ?? null;
}
function getFhirBundleByAbhaId(abhaId) {
    const match = exports.mockPatientRecords.find((record) => record.abhaId === abhaId);
    if (!match) {
        return null;
    }
    return {
        resourceType: "Bundle",
        type: "collection",
        total: match.resources.length,
        entry: match.resources.map((resource) => ({
            fullUrl: `${match.sources.find((source) => source.id === resource.sourceId)?.fhirBaseUrl}/${resource.resourceType}/${resource.resourceId}`,
            resource: resource.payload,
            recordedAt: resource.recordedAt,
            sourceId: resource.sourceId,
        })),
    };
}
