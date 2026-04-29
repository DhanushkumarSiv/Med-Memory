import express, { Request, Response } from "express";
import { AgentOrchestrator } from "../agents/orchestrator";
import { runQuery } from "../db/neo4j";
import { getOfflineFhirRowsByPatientId, getOfflinePatientById } from "../fhir/offlineDemo";
import { normalizeFhirRows } from "../fhir/normalizer";
import { consentGuard } from "../middleware/consentGuard";

const router = express.Router();
const orchestrator = new AgentOrchestrator();

function isDbUnavailableError(error: unknown): boolean {
  const message = (error as Error)?.message?.toLowerCase() ?? "";
  return message.includes("failed to connect to server") || message.includes("serviceunavailable");
}

function buildOfflinePipeline(patientId: string): Record<string, unknown> {
  const rows = getOfflineFhirRowsByPatientId(patientId);
  const summary = normalizeFhirRows(rows);
  const activeProblems = summary.conditions.map((condition) => condition.title).slice(0, 6);
  const currentMedications = summary.medications.map((medication) => medication.title).slice(0, 8);
  const recentLabs = summary.labs
    .slice(0, 4)
    .map((lab) => `${lab.title}: ${lab.details}`);

  return {
    aggregated: {
      conditions: summary.conditions,
      medications: summary.medications,
      labs: summary.labs,
      allergies: summary.allergies,
      procedures: [],
    },
    synthesis: {
      patientOverview: `Consolidated chart contains ${summary.conditions.length} active conditions, ${summary.medications.length} medication records, and ${summary.labs.length} lab observations.`,
      activeProblems,
      currentMedications,
      keyFindings: recentLabs.length > 0 ? `Recent labs: ${recentLabs.join("; ")}` : "No recent labs available.",
      longitudinalNarrative: "Offline demo mode: data served from bundled mock records.",
      clinicalPearls: [
        "Review medications against the latest labs.",
        "Cross-check allergy entries before prescribing.",
      ],
    },
    risks: [],
    timestamp: new Date().toISOString(),
    failedAgents: [],
  };
}

function buildOfflineRagResponse(question: string, patientId: string): Record<string, unknown> {
  const rows = getOfflineFhirRowsByPatientId(patientId);
  const normalizedQuestion = question.toLowerCase();
  const prioritized = rows
    .map((row) => ({
      row,
      text: `${row.resourceType} ${row.sourceName} ${row.payload}`.toLowerCase(),
    }))
    .map((entry) => {
      let score = 0;
      if (normalizedQuestion.includes("medication") && entry.row.resourceType === "MedicationRequest") {
        score += 4;
      }
      if (normalizedQuestion.includes("allergy") && entry.row.resourceType === "AllergyIntolerance") {
        score += 4;
      }
      if ((normalizedQuestion.includes("lab") || normalizedQuestion.includes("result")) && entry.row.resourceType === "Observation") {
        score += 4;
      }
      if ((normalizedQuestion.includes("cardiac") || normalizedQuestion.includes("heart")) && entry.text.includes("hypertension")) {
        score += 5;
      }

      const tokens = normalizedQuestion.split(/\s+/).filter((token) => token.length > 2);
      for (const token of tokens) {
        if (entry.text.includes(token)) {
          score += 1;
        }
      }
      return { ...entry, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  const relevantRecords = prioritized.map((entry) => ({
    date: entry.row.recordedAt,
    source: entry.row.sourceName,
    type: entry.row.resourceType,
    content: entry.row.payload,
  }));

  const top = relevantRecords[0];
  return {
    answer: top
      ? `Most relevant chart finding: ${top.type} from ${top.source} on ${top.date}.`
      : "No strong match found in offline demo records.",
    confidence: top ? "medium" : "low",
    relevantRecords,
    caveat: "Offline demo mode response.",
  };
}

function denyIfUnauthorisedProvider(req: Request, res: Response): boolean {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return true;
  }
  if (user.role !== "provider" || user.authorised !== true) {
    res.status(403).json({ message: "Only authorised providers can access this route" });
    return true;
  }
  return false;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    if (denyIfUnauthorisedProvider(req, res)) {
      return;
    }

    const rows = await runQuery<{ p: Record<string, unknown> }>(
      `
      MATCH (p:Patient)
      RETURN p
      ORDER BY p.name
      `
    );

    res.json(
      rows.map((row) => ({
        id: row.p.id,
        name: row.p.name,
        abhaId: row.p.abhaId,
        dob: row.p.dob,
        gender: row.p.gender,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch patients", error: (error as Error).message });
  }
});

router.get("/:id", consentGuard("patient:read"), async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.id ?? "");
    const rows = await runQuery<{ p: Record<string, unknown> }>(
      `
      MATCH (p:Patient {id: $patientId})
      RETURN p
      LIMIT 1
      `,
      { patientId }
    );

    if (!rows[0]) {
      res.status(404).json({ message: "Patient not found" });
      return;
    }

    res.json(rows[0].p);
  } catch (error) {
    if (isDbUnavailableError(error)) {
      const patientId = String(req.params.id ?? "");
      const offlinePatient = getOfflinePatientById(patientId);
      if (offlinePatient) {
        res.json(offlinePatient);
        return;
      }
    }
    res.status(500).json({ message: "Failed to fetch patient", error: (error as Error).message });
  }
});

router.get("/:id/fhir-summary", consentGuard("patient:fhir"), async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.id ?? "");
    const rows = await runQuery<{
      resourceId: string;
      resourceType: string;
      payload: string;
      recordedAt: string;
      sourceName: string;
    }>(
      `
      MATCH (:Patient {id: $patientId})-[:HAS_SOURCE]->(s:FhirSource)-[:CONTAINS]->(r:FhirResource)
      RETURN r.resourceId AS resourceId, r.resourceType AS resourceType, r.payload AS payload, r.recordedAt AS recordedAt, s.sourceName AS sourceName
      ORDER BY r.recordedAt DESC
      `,
      { patientId }
    );

    res.json(normalizeFhirRows(rows));
  } catch (error) {
    if (isDbUnavailableError(error)) {
      const patientId = String(req.params.id ?? "");
      const offlineRows = getOfflineFhirRowsByPatientId(patientId);
      if (offlineRows.length > 0) {
        res.json(normalizeFhirRows(offlineRows));
        return;
      }
    }
    res.status(500).json({ message: "Failed to get FHIR summary", error: (error as Error).message });
  }
});

router.post("/:id/run-pipeline", consentGuard("patient:run-pipeline"), async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.id ?? "");
    const result = await orchestrator.runPipeline(patientId);
    res.json(result);
  } catch (error) {
    if (isDbUnavailableError(error)) {
      const patientId = String(req.params.id ?? "");
      const offlineRows = getOfflineFhirRowsByPatientId(patientId);
      if (offlineRows.length > 0) {
        res.json(buildOfflinePipeline(patientId));
        return;
      }
    }
    res.status(500).json({ message: "Pipeline execution failed", error: (error as Error).message });
  }
});

router.post("/:id/query", consentGuard("patient:query"), async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.id ?? "");
    const { question } = req.body as { question?: string };
    if (!question) {
      res.status(400).json({ message: "question is required" });
      return;
    }

    const result = await orchestrator.runRagQuery(patientId, question);
    res.json(result);
  } catch (error) {
    if (isDbUnavailableError(error)) {
      const patientId = String(req.params.id ?? "");
      const offlineRows = getOfflineFhirRowsByPatientId(patientId);
      if (offlineRows.length > 0) {
        const question = String((req.body as { question?: string }).question ?? "");
        res.json(buildOfflineRagResponse(question, patientId));
        return;
      }
    }
    res.status(500).json({ message: "RAG query failed", error: (error as Error).message });
  }
});

export default router;
