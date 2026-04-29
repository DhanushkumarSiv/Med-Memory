"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedGraph = seedGraph;
const bcrypt_1 = __importDefault(require("bcrypt"));
const uuid_1 = require("uuid");
const loadEnv_1 = require("../config/loadEnv");
const neo4j_1 = require("./neo4j");
const mockEndpoints_1 = require("../fhir/mockEndpoints");
(0, loadEnv_1.loadEnv)();
function relationshipForResource(resourceType) {
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
async function seedPatients() {
    for (const patient of mockEndpoints_1.mockPatientRecords) {
        const now = new Date().toISOString();
        const patientId = (0, uuid_1.v4)();
        const passwordHash = await bcrypt_1.default.hash("Demo@1234", 10);
        const patientNode = {
            id: patientId,
            abhaId: patient.abhaId,
            name: patient.name,
            dob: patient.dob,
            gender: patient.gender,
            phone: patient.phone,
            passwordHash,
            createdAt: now,
        };
        await (0, neo4j_1.runQuery)(`
      MERGE (p:Patient {abhaId: $abhaId})
      ON CREATE SET p.id = $id, p.name = $name, p.dob = $dob, p.gender = $gender, p.phone = $phone, p.passwordHash = $passwordHash, p.createdAt = $createdAt
      ON MATCH SET p.name = $name, p.dob = $dob, p.gender = $gender, p.phone = $phone, p.passwordHash = $passwordHash
      `, patientNode);
        for (const source of patient.sources) {
            await (0, neo4j_1.runQuery)(`
        MATCH (p:Patient {abhaId: $abhaId})
        MERGE (s:FhirSource {id: $sourceId})
        ON CREATE SET s.sourceName = $sourceName, s.sourceType = $sourceType, s.fhirBaseUrl = $fhirBaseUrl, s.lastSyncedAt = $lastSyncedAt
        ON MATCH SET s.lastSyncedAt = $lastSyncedAt
        MERGE (p)-[:HAS_SOURCE]->(s)
        `, {
                abhaId: patient.abhaId,
                sourceId: source.id,
                sourceName: source.sourceName,
                sourceType: source.sourceType,
                fhirBaseUrl: source.fhirBaseUrl,
                lastSyncedAt: now,
            });
        }
        for (const resource of patient.resources) {
            const nodeId = `${patient.abhaId}-${resource.resourceId}`;
            const relationship = relationshipForResource(resource.resourceType);
            await (0, neo4j_1.runQuery)(`
        MATCH (p:Patient {abhaId: $abhaId})
        MATCH (s:FhirSource {id: $sourceId})
        MERGE (r:FhirResource {id: $nodeId})
        ON CREATE SET r.resourceType = $resourceType, r.resourceId = $resourceId, r.payload = $payload, r.recordedAt = $recordedAt
        ON MATCH SET r.payload = $payload, r.recordedAt = $recordedAt
        MERGE (s)-[:CONTAINS]->(r)
        ${relationship ? `MERGE (p)-[:${relationship}]->(r)` : ""}
        `, {
                abhaId: patient.abhaId,
                sourceId: resource.sourceId,
                nodeId,
                resourceType: resource.resourceType,
                resourceId: resource.resourceId,
                payload: JSON.stringify(resource.payload),
                recordedAt: resource.recordedAt,
            });
        }
    }
}
async function seedProvider() {
    const now = new Date().toISOString();
    const passwordHash = await bcrypt_1.default.hash("Doctor@1234", 10);
    await (0, neo4j_1.runQuery)(`
    MERGE (pr:Provider {id: $id})
    ON CREATE SET pr.name = $name, pr.type = $type, pr.loginId = $loginId, pr.passwordHash = $passwordHash, pr.createdAt = $createdAt
    ON MATCH SET pr.name = $name, pr.type = $type, pr.loginId = $loginId, pr.passwordHash = $passwordHash
    `, {
        id: "provider-dr-meera",
        name: "Dr. Meera Pillai",
        type: "clinician",
        loginId: "dr.meera@medmemory.in",
        passwordHash,
        createdAt: now,
    });
}
async function seedGraph() {
    await seedPatients();
    await seedProvider();
}
async function main() {
    try {
        await seedGraph();
        // eslint-disable-next-line no-console
        console.log("Seed complete");
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error("Seed failed", error);
        process.exitCode = 1;
    }
    finally {
        await (0, neo4j_1.closeDriver)();
    }
}
if (require.main === module) {
    void main();
}
