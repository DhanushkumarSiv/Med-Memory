import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { runQuery } from "../db/neo4j";
import { invalidateOtp, listPendingOtps } from "../services/otpService";
import { consentGuard } from "../middleware/consentGuard";

const router = express.Router();

router.get("/:patientId", consentGuard("consent:read"), async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.patientId ?? "");
    const rows = await runQuery<{ c: Record<string, unknown> }>(
      `
      MATCH (:Patient {id: $patientId})-[:GRANTED_ACCESS_TO]->(c:ConsentToken)
      RETURN c
      ORDER BY c.grantedAt DESC
      `,
      { patientId }
    );

    res.json(rows.map((row) => row.c));
  } catch (error) {
    res.status(500).json({ message: "Failed to list consent tokens", error: (error as Error).message });
  }
});

router.post("/:patientId/grant", consentGuard("consent:read"), async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.patientId ?? "");
    const { providerName, providerType, scopes, expiresAt, providerId } = req.body as {
      providerName?: string;
      providerType?: string;
      scopes?: string[];
      expiresAt?: string;
      providerId?: string;
    };

    if (!providerName || !providerType || !scopes || scopes.length === 0 || !expiresAt) {
      res.status(400).json({ message: "providerName, providerType, scopes and expiresAt are required" });
      return;
    }

    const tokenId = uuidv4();
    const token = uuidv4();

    await runQuery(
      `
      MATCH (p:Patient {id: $patientId})
      OPTIONAL MATCH (provider:Provider {id: $providerId})
      CREATE (c:ConsentToken {
        id: $id,
        token: $token,
        providerName: $providerName,
        providerType: $providerType,
        scopes: $scopes,
        grantedAt: $grantedAt,
        expiresAt: $expiresAt,
        revokedAt: null
      })
      MERGE (p)-[:GRANTED_ACCESS_TO]->(c)
      FOREACH (_ IN CASE WHEN provider IS NULL THEN [] ELSE [1] END | MERGE (c)-[:AUTHORISES]->(provider))
      `,
      {
        patientId,
        providerId: providerId ?? null,
        id: tokenId,
        token,
        providerName,
        providerType,
        scopes: JSON.stringify(scopes),
        grantedAt: new Date().toISOString(),
        expiresAt,
      }
    );

    res.status(201).json({ id: tokenId, token });
  } catch (error) {
    res.status(500).json({ message: "Failed to grant consent", error: (error as Error).message });
  }
});

router.delete("/:patientId/revoke/:tokenId", consentGuard("consent:read"), async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.patientId ?? "");
    const tokenId = String(req.params.tokenId ?? "");
    await runQuery(
      `
      MATCH (:Patient {id: $patientId})-[:GRANTED_ACCESS_TO]->(c:ConsentToken {id: $tokenId})
      SET c.revokedAt = $revokedAt
      `,
      {
        patientId,
        tokenId,
        revokedAt: new Date().toISOString(),
      }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to revoke consent", error: (error as Error).message });
  }
});

router.get("/:patientId/pending-otps", consentGuard("consent:read"), async (req: Request, res: Response) => {
  try {
    const pending = await listPendingOtps(String(req.params.patientId ?? ""));
    res.json(pending);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch pending OTP requests", error: (error as Error).message });
  }
});

router.post("/:patientId/pending-otps/:otpId/deny", consentGuard("consent:read"), async (req: Request, res: Response) => {
  try {
    await invalidateOtp(String(req.params.otpId ?? ""));
    res.json({ denied: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to deny OTP request", error: (error as Error).message });
  }
});

export default router;
