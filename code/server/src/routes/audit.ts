import express, { Request, Response } from "express";
import { runQuery } from "../db/neo4j";
import { consentGuard } from "../middleware/consentGuard";

const router = express.Router();

router.get("/:patientId", consentGuard("audit:read"), async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.patientId ?? "");
    const rows = await runQuery<{ a: Record<string, unknown> }>(
      `
      MATCH (:Patient {id: $patientId})-[:HAS_AUDIT_ENTRY]->(a:AuditEntry)
      RETURN a
      ORDER BY a.accessedAt DESC
      `,
      { patientId }
    );

    res.json(rows.map((row) => row.a));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch audit entries", error: (error as Error).message });
  }
});

export default router;
