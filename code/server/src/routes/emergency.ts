import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { runQuery } from "../db/neo4j";

const router = express.Router();

router.post("/:abhaId", async (req: Request, res: Response) => {
  try {
    const { reason, accessor } = req.body as { reason?: string; accessor?: string };
    if (!reason || reason.trim().length < 3) {
      res.status(400).json({ message: "Reason is mandatory for break-glass access" });
      return;
    }

    const rows = await runQuery<{ p: Record<string, unknown> }>(
      `
      MATCH (p:Patient {abhaId: $abhaId})
      RETURN p
      LIMIT 1
      `,
      { abhaId: req.params.abhaId }
    );

    if (!rows[0]) {
      res.status(404).json({ message: "Patient not found" });
      return;
    }

    const patient = rows[0].p;
    const details = await runQuery<{ resourceType: string; payload: string }>(
      `
      MATCH (:Patient {id: $patientId})-[:HAS_SOURCE]->(:FhirSource)-[:CONTAINS]->(r:FhirResource)
      RETURN r.resourceType AS resourceType, r.payload AS payload
      `,
      { patientId: patient.id }
    );

    await runQuery(
      `
      MATCH (p:Patient {id: $patientId})
      CREATE (a:AuditEntry {
        id: $id,
        accessor: $accessor,
        action: 'emergency_break_glass',
        resourceAccessed: $resourceAccessed,
        consentTokenUsed: $reason,
        accessedAt: $accessedAt
      })
      MERGE (p)-[:HAS_AUDIT_ENTRY]->(a)
      `,
      {
        patientId: patient.id,
        id: uuidv4(),
        accessor: accessor ?? "emergency-operator",
        resourceAccessed: `emergency/${req.params.abhaId}`,
        reason,
        accessedAt: new Date().toISOString(),
      }
    );

    const conditions = details
      .filter((row) => row.resourceType === "Condition")
      .map((row) => JSON.parse(row.payload) as Record<string, unknown>);
    const medications = details
      .filter((row) => row.resourceType === "MedicationRequest")
      .map((row) => JSON.parse(row.payload) as Record<string, unknown>);
    const allergies = details
      .filter((row) => row.resourceType === "AllergyIntolerance")
      .map((row) => JSON.parse(row.payload) as Record<string, unknown>);

    res.json({
      patient: {
        id: patient.id,
        abhaId: patient.abhaId,
        name: patient.name,
        gender: patient.gender,
      },
      conditions,
      medications,
      allergies,
      breakGlassReason: reason,
    });
  } catch (error) {
    res.status(500).json({ message: "Emergency access failed", error: (error as Error).message });
  }
});

export default router;
