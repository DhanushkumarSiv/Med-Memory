import express, { Request, Response } from "express";
import { runQuery } from "../db/neo4j";

const router = express.Router();

router.get("/:token", async (req: Request, res: Response) => {
  try {
    const rows = await runQuery<{ c: Record<string, unknown> }>(
      `
      MATCH (c:ConsentToken {token: $token})
      RETURN c
      LIMIT 1
      `,
      { token: req.params.token }
    );

    const consent = rows[0]?.c;
    if (!consent) {
      res.status(404).json({ valid: false, reason: "token_not_found" });
      return;
    }

    const now = new Date();
    const expired = new Date(String(consent.expiresAt)).getTime() < now.getTime();
    const revoked = Boolean(consent.revokedAt);

    res.json({ valid: !expired && !revoked, expired, revoked, consent });
  } catch (error) {
    res.status(500).json({ message: "Failed to verify consent token", error: (error as Error).message });
  }
});

export default router;
