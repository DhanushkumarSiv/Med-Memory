import express, { Request, Response } from "express";
import { AgentOrchestrator } from "../agents/orchestrator";
import { runQuery } from "../db/neo4j";
import { normalizeFhirRows } from "../fhir/normalizer";
import { consentGuard } from "../middleware/consentGuard";

const router = express.Router();
const orchestrator = new AgentOrchestrator();

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
    res.status(500).json({ message: "Failed to get FHIR summary", error: (error as Error).message });
  }
});

router.post("/:id/run-pipeline", consentGuard("patient:run-pipeline"), async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.id ?? "");
    const result = await orchestrator.runPipeline(patientId);
    res.json(result);
  } catch (error) {
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
    res.status(500).json({ message: "RAG query failed", error: (error as Error).message });
  }
});

export default router;
