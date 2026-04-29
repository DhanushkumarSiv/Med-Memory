import { mockPatientRecords } from "./mockEndpoints";

export interface OfflinePatientProfile {
  id: string;
  abhaId: string;
  name: string;
  dob: string;
  gender: string;
  phone: string;
}

export interface OfflineFhirRow {
  resourceId: string;
  resourceType: string;
  payload: string;
  recordedAt: string;
  sourceName: string;
}

export function offlinePatientId(abhaId: string): string {
  return `offline-${abhaId}`;
}

export function getOfflinePatientByAbhaId(abhaId: string): OfflinePatientProfile | null {
  const normalized = abhaId.trim().toUpperCase();
  const match = mockPatientRecords.find((record) => record.abhaId.toUpperCase() === normalized);
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

export function getOfflinePatientById(patientId: string): OfflinePatientProfile | null {
  const abhaId = patientId.startsWith("offline-") ? patientId.slice("offline-".length) : "";
  if (!abhaId) {
    return null;
  }
  return getOfflinePatientByAbhaId(abhaId);
}

export function getOfflineFhirRowsByPatientId(patientId: string): OfflineFhirRow[] {
  const profile = getOfflinePatientById(patientId);
  if (!profile) {
    return [];
  }

  const patient = mockPatientRecords.find((record) => record.abhaId === profile.abhaId);
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
