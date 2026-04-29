import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { runQuery } from "../db/neo4j";
import { AuthUser } from "../types/auth";

function resolvePatientId(req: Request): string | null {
  const rawParam = req.params.id ?? req.params.patientId;
  const fromParams = typeof rawParam === "string" ? rawParam : null;
  const body = req.body as Record<string, unknown>;
  const fromBody = typeof body.patientId === "string" ? body.patientId : null;
  return fromParams ?? fromBody;
}

export function consentGuard(requiredScope: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user as AuthUser | undefined;
      if (!user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const patientId = resolvePatientId(req);
      if (!patientId) {
        res.status(400).json({ message: "Patient context missing" });
        return;
      }

      if (user.role === "patient") {
        if (user.patientId !== patientId) {
          res.status(403).json({ message: "Patients can only access their own records" });
          return;
        }

        await runQuery(
          `
          MATCH (p:Patient {id: $patientId})
          CREATE (a:AuditEntry {
            id: $id,
            accessor: $accessor,
            action: $action,
            resourceAccessed: $resourceAccessed,
            consentTokenUsed: '',
            accessedAt: $accessedAt
          })
          MERGE (p)-[:HAS_AUDIT_ENTRY]->(a)
          `,
          {
            patientId,
            id: uuidv4(),
            accessor: user.abhaId ?? "patient-self",
            action: "patient-self-access",
            resourceAccessed: `${req.method} ${req.originalUrl}`,
            accessedAt: new Date().toISOString(),
          }
        );

        next();
        return;
      }

      if (user.role !== "provider" || user.authorised !== true || user.patientId !== patientId) {
        res.status(403).json({ message: "Consent session not authorised for this patient" });
        return;
      }

      if (!user.scopes?.includes(requiredScope)) {
        res.status(403).json({ message: "Missing required scope" });
        return;
      }

      if (!user.consentToken) {
        res.status(403).json({ message: "Missing consent token" });
        return;
      }

      const consentRows = await runQuery<{ c: Record<string, unknown> }>(
        `
        MATCH (:Patient {id: $patientId})-[:GRANTED_ACCESS_TO]->(c:ConsentToken {token: $token})
        WHERE c.revokedAt IS NULL AND c.expiresAt > $nowIso
        RETURN c
        LIMIT 1
        `,
        {
          patientId,
          token: user.consentToken,
          nowIso: new Date().toISOString(),
        }
      );

      if (!consentRows[0]) {
        res.status(403).json({ message: "Consent token revoked or expired" });
        return;
      }

      await runQuery(
        `
        MATCH (p:Patient {id: $patientId})
        CREATE (a:AuditEntry {
          id: $id,
          accessor: $accessor,
          action: $action,
          resourceAccessed: $resourceAccessed,
          consentTokenUsed: $consentTokenUsed,
          accessedAt: $accessedAt
        })
        MERGE (p)-[:HAS_AUDIT_ENTRY]->(a)
        `,
        {
          patientId,
          id: uuidv4(),
          accessor: user.providerName ?? "provider",
          action: "patient-record-access",
          resourceAccessed: `${req.method} ${req.originalUrl}`,
          consentTokenUsed: user.consentToken,
          accessedAt: new Date().toISOString(),
        }
      );

      next();
    } catch (error) {
      res.status(500).json({ message: "Consent validation failed", error: (error as Error).message });
    }
  };
}
