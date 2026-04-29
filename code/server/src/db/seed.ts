import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { loadEnv } from "../config/loadEnv";
import { closeDriver, runQuery } from "./neo4j";
import { mockPatientRecords, MockFhirResource } from "../fhir/mockEndpoints";
loadEnv();

interface SeedPatient {
  id: string;
  abhaId: string;
  name: string;
  dob: string;
  gender: string;
  phone: string;
  passwordHash: string;
  createdAt: string;
}

function relationshipForResource(resourceType: MockFhirResource["resourceType"]): string | null {
  switch (resourceType) {
    case "Condition":
      return "CONDITION";
    case "MedicationRequest":
      return "MEDICATION";
    case "Observation":
      return "LAB_RESULT";
    default:
      return null;
  }
}

async function seedPatients(): Promise<void> {
  for (const patient of mockPatientRecords) {
    const now = new Date().toISOString();
    const patientId = uuidv4();
    const passwordHash = await bcrypt.hash("Demo@1234", 10);

    const patientNode: SeedPatient = {
      id: patientId,
      abhaId: patient.abhaId,
      name: patient.name,
      dob: patient.dob,
      gender: patient.gender,
      phone: patient.phone,
      passwordHash,
      createdAt: now,
    };

    await runQuery(
      `
      MERGE (p:Patient {abhaId: $abhaId})
      ON CREATE SET p.id = $id, p.name = $name, p.dob = $dob, p.gender = $gender, p.phone = $phone, p.passwordHash = $passwordHash, p.createdAt = $createdAt
      ON MATCH SET p.name = $name, p.dob = $dob, p.gender = $gender, p.phone = $phone, p.passwordHash = $passwordHash
      `,
      patientNode as unknown as Record<string, unknown>
    );

    for (const source of patient.sources) {
      await runQuery(
        `
        MATCH (p:Patient {abhaId: $abhaId})
        MERGE (s:FhirSource {id: $sourceId})
        ON CREATE SET s.sourceName = $sourceName, s.sourceType = $sourceType, s.fhirBaseUrl = $fhirBaseUrl, s.lastSyncedAt = $lastSyncedAt
        ON MATCH SET s.lastSyncedAt = $lastSyncedAt
        MERGE (p)-[:HAS_SOURCE]->(s)
        `,
        {
          abhaId: patient.abhaId,
          sourceId: source.id,
          sourceName: source.sourceName,
          sourceType: source.sourceType,
          fhirBaseUrl: source.fhirBaseUrl,
          lastSyncedAt: now,
        }
      );
    }

    for (const resource of patient.resources) {
      const nodeId = `${patient.abhaId}-${resource.resourceId}`;
      const relationship = relationshipForResource(resource.resourceType);

      await runQuery(
        `
        MATCH (p:Patient {abhaId: $abhaId})
        MATCH (s:FhirSource {id: $sourceId})
        MERGE (r:FhirResource {id: $nodeId})
        ON CREATE SET r.resourceType = $resourceType, r.resourceId = $resourceId, r.payload = $payload, r.recordedAt = $recordedAt
        ON MATCH SET r.payload = $payload, r.recordedAt = $recordedAt
        MERGE (s)-[:CONTAINS]->(r)
        ${relationship ? `MERGE (p)-[:${relationship}]->(r)` : ""}
        `,
        {
          abhaId: patient.abhaId,
          sourceId: resource.sourceId,
          nodeId,
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          payload: JSON.stringify(resource.payload),
          recordedAt: resource.recordedAt,
        }
      );
    }
  }
}

async function seedProvider(): Promise<void> {
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash("Doctor@1234", 10);

  await runQuery(
    `
    MERGE (pr:Provider {id: $id})
    ON CREATE SET pr.name = $name, pr.type = $type, pr.loginId = $loginId, pr.passwordHash = $passwordHash, pr.createdAt = $createdAt
    ON MATCH SET pr.name = $name, pr.type = $type, pr.loginId = $loginId, pr.passwordHash = $passwordHash
    `,
    {
      id: "provider-dr-meera",
      name: "Dr. Meera Pillai",
      type: "clinician",
      loginId: "dr.meera@medmemory.in",
      passwordHash,
      createdAt: now,
    }
  );
}

export async function seedGraph(): Promise<void> {
  await seedPatients();
  await seedProvider();
}

async function main(): Promise<void> {
  try {
    await seedGraph();
    // eslint-disable-next-line no-console
    console.log("Seed complete");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Seed failed", error);
    process.exitCode = 1;
  } finally {
    await closeDriver();
  }
}

if (require.main === module) {
  void main();
}
