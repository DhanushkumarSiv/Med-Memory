"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.offlinePatientId = offlinePatientId;
exports.getOfflinePatientByAbhaId = getOfflinePatientByAbhaId;
exports.getOfflinePatientById = getOfflinePatientById;
exports.getOfflineFhirRowsByPatientId = getOfflineFhirRowsByPatientId;
const mockEndpoints_1 = require("./mockEndpoints");
function offlinePatientId(abhaId) {
    return `offline-${abhaId}`;
}
function getOfflinePatientByAbhaId(abhaId) {
    const normalized = abhaId.trim().toUpperCase();
    const match = mockEndpoints_1.mockPatientRecords.find((record) => record.abhaId.toUpperCase() === normalized);
    if (!match) {
        return null;
    }
    return {
        id: offlinePatientId(match.abhaId),
        abhaId: match.abhaId,
        name: match.name,
        dob: match.dob,
        gender: match.gender,
        phone: match.phone,
    };
}
function getOfflinePatientById(patientId) {
    const abhaId = patientId.startsWith("offline-") ? patientId.slice("offline-".length) : "";
    if (!abhaId) {
        return null;
    }
    return getOfflinePatientByAbhaId(abhaId);
}
function getOfflineFhirRowsByPatientId(patientId) {
    const profile = getOfflinePatientById(patientId);
    if (!profile) {
        return [];
    }
    const patient = mockEndpoints_1.mockPatientRecords.find((record) => record.abhaId === profile.abhaId);
    if (!patient) {
        return [];
    }
    const sourceMap = new Map(patient.sources.map((source) => [source.id, source.sourceName]));
    return [...patient.resources]
        .sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime())
        .map((resource) => ({
        resourceId: resource.resourceId,
        resourceType: resource.resourceType,
        payload: JSON.stringify(resource.payload),
        recordedAt: resource.recordedAt,
        sourceName: sourceMap.get(resource.sourceId) ?? "Unknown Source",
    }));
}
