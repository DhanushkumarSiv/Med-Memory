# MedMemory OS

**Tagline:** The AI brain for fragmented health records

MedMemory OS is a consent-first Patient Memory Operating System that aggregates fragmented FHIR R4 records across sources, runs a multi-agent AI synthesis pipeline, surfaces longitudinal risk signals, and exposes controlled access via patient OTP approval.

## 1) Problem Statement

Healthcare data is fragmented across hospitals, diagnostics, pharmacies, and siloed systems. Clinicians lose context, patients lose control, and decisions become reactive. MedMemory OS solves this by:
- Unifying mock FHIR R4 records into one graph-backed memory
- Running AI agents that aggregate, synthesize, and detect risk signals
- Enforcing patient-controlled OTP consent per provider access session
- Logging all access, including emergency break-glass usage

## 2) Architecture (5 Layers)

```text
+--------------------------------------------------------------+
|  Layer 5: Experience Layer                                   |
|  React app (Login, Clinician Dashboard, Patient App, Demo)   |
+--------------------------------------------------------------+
|  Layer 4: Consent + Security Layer                           |
|  JWT auth, OTP workflow, consentGuard scopes, audit logging  |
+--------------------------------------------------------------+
|  Layer 3: Intelligence Layer                                 |
|  Claude agents: Aggregator, Synthesizer, Risk, RAG Memory    |
+--------------------------------------------------------------+
|  Layer 2: Clinical Data API Layer                            |
|  Express routes: auth, patients, consent, audit, fhir, demo  |
+--------------------------------------------------------------+
|  Layer 1: Graph Persistence Layer                            |
|  Neo4j nodes/edges for patients, FHIR, OTP, consent, audit   |
+--------------------------------------------------------------+
```

## 3) Neo4j Graph Schema

```text
(:Patient)-[:HAS_SOURCE]->(:FhirSource)-[:CONTAINS]->(:FhirResource)
(:Patient)-[:HAS_AGENT_OUTPUT]->(:AgentOutput)
(:Patient)-[:GRANTED_ACCESS_TO]->(:ConsentToken)-[:AUTHORISES]->(:Provider)
(:Patient)-[:HAS_OTP]->(:OtpRecord)
(:Patient)-[:HAS_AUDIT_ENTRY]->(:AuditEntry)
(:Patient)-[:CONDITION]->(:FhirResource {resourceType:'Condition'})
(:Patient)-[:MEDICATION]->(:FhirResource {resourceType:'MedicationRequest'})
(:Patient)-[:LAB_RESULT]->(:FhirResource {resourceType:'Observation'})
```

Constraints/indexes are initialized at startup in `server/src/db/neo4j.ts`.

## 4) Authentication + OTP Consent Flow

### A) Patient self-login
1. Patient enters ABHA ID + password
2. Server validates bcrypt hash
3. JWT issued with `role=patient`
4. Patient sees only own records

### B) Provider login + patient OTP consent
1. Provider logs in (partial session token, not authorized)
2. Provider looks up patient by ABHA (safe metadata only)
3. Provider requests OTP (stored in Neo4j, 5-min expiry, single-use)
4. Patient shares OTP -> provider verifies -> full authorized JWT issued

On verify success:
- Consent token is validated or auto-created
- OTP marked used
- Access JWT issued with patientId + scopes
- Audit entry created (`otp-consent-granted`)

Security controls:
- Max 3 OTP requests/provider/patient/hour
- Max 3 OTP verification attempts per OTP
- Constant-time OTP compare via `crypto.timingSafeEqual`

## 5) Setup

## Prerequisites
- Node.js 18+
- Docker (for Neo4j)

## Neo4j (Docker)
```bash
docker run \
  --name medmemory-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/medmemory123 \
  -e NEO4J_PLUGINS='["apoc"]' \
  neo4j:5
```

## Environment
Copy `.env.example` to `.env` and configure:
- `ANTHROPIC_API_KEY`
- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `OTP_EXPIRY_MINUTES`
- `PORT`

## Install
```bash
npm install
```

## Seed
```bash
npm run seed
```

## Run
```bash
npm run dev
```
- Client: `http://localhost:5173`
- API: `http://localhost:3001`

## 6) Agent Pipeline

Implemented in `server/src/agents/`:
1. **Record Aggregator**: dedupe + reconcile multi-source FHIR
2. **Clinical Synthesizer**: clinician-ready longitudinal summary
3. **Risk Detector**: structured severity-tagged risk signals
4. **RAG Memory Agent**: Q/A with relevant historical citations

Pipeline orchestration:
- Fetch all `FhirResource` for patient from Neo4j
- Run Agents 1->2->3 and persist each output to `AgentOutput`
- Run Agent 4 on-demand via query route
- Return partial payload when one agent fails
- Retry Claude once after 2s on rate-limit

## 7) Consent Model

- Provider login does not grant data access by default
- Access requires patient OTP + valid consent token
- Consent token must be unrevoked and unexpired
- Scopes are validated per route through `consentGuard`
- Every successful protected access is audit-logged

## 8) Demo Walkthrough

Frontend `/demo` route auto-runs the hackathon story:
1. Narrative banner appears
2. Provider flow auto-plays step-by-step
3. OTP is requested and shown in DEV banner
4. OTP auto-entered and verified
5. Redirect to Clinician Dashboard
6. Pipeline loading steps animate
7. Risk list is shown with eGFR highlight pulse
8. RAG auto-query submitted:
   `Is this patient on medications that interact with CKD?`

## 9) Tech Stack and Rationale

- **React + TypeScript + Tailwind**: fast UI iteration, strict typing, responsive UX
- **Express + TypeScript**: simple API composition and clear route boundaries
- **Neo4j graph model**: natural representation of patient-source-resource relationships
- **JWT + bcrypt**: portable auth without external providers
- **Anthropic Claude (raw SDK)**: explicit multi-agent prompting and deterministic orchestration

## 10) FHIR R4 Compliance Notes

Mock payloads are FHIR-style for:
- `Patient`
- `Condition`
- `MedicationRequest`
- `Observation`
- `AllergyIntolerance`
- `DiagnosticReport`

Records are stored as full JSON payload strings in Neo4j, preserving schema fidelity for downstream ABDM/FHIR connector upgrades.

## 11) ABDM Integration Roadmap

1. Replace mock FHIR endpoints with ABDM-compliant consented data pulls
2. Integrate real SMS sender (Twilio/AWS SNS) by swapping OTP sender interface
3. Add gateway signing, consent artifact verification, and provenance tracking
4. Add clinician organization registry + HIPAA/DPDP audit policies
5. Add longitudinal embeddings + retrieval index for richer clinical memory

## 12) Demo Accounts

### Patient 1
- ABHA: `ABHA-1001-2024`
- Password: `Demo@1234`

### Patient 2
- ABHA: `ABHA-2042-2024`
- Password: `Demo@1234`

### Provider
- Login: `dr.meera@medmemory.in`
- Password: `Doctor@1234`

---

Built for hackathon speed with production-minded architecture boundaries.
