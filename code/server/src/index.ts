import cors from "cors";
import express from "express";
import { loadEnv } from "./config/loadEnv";
import authRoutes from "./routes/auth";
import patientRoutes from "./routes/patients";
import consentRoutes from "./routes/consent";
import consentPublicRoutes from "./routes/consentPublic";
import fhirRoutes from "./routes/fhir";
import auditRoutes from "./routes/audit";
import agentRoutes from "./routes/agents";
import emergencyRoutes from "./routes/emergency";
import { authMiddleware } from "./middleware/authMiddleware";
import { checkNeo4jHealth, initConstraints } from "./db/neo4j";
import { seedGraph } from "./db/seed";

const app = express();
loadEnv();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "MedMemory OS API" });
});

app.get("/health/services", async (_req, res) => {
  const neo4j = await checkNeo4jHealth();
  const status = neo4j.up ? "ok" : "degraded";
  res.status(neo4j.up ? 200 : 503).json({
    status,
    api: { up: true },
    neo4j: {
      up: neo4j.up,
      error: neo4j.error ?? null,
    },
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/fhir", fhirRoutes);
app.use("/api/v1/emergency", emergencyRoutes);
app.use("/api/v1/consent/verify", consentPublicRoutes);
app.use("/api/v1/patients", authMiddleware, patientRoutes);
app.use("/api/v1/consent", authMiddleware, consentRoutes);
app.use("/api/v1/audit", authMiddleware, auditRoutes);
app.use("/api/v1/agents", authMiddleware, agentRoutes);

async function start(): Promise<void> {
  let startupWarning: string | null = null;
  try {
    await initConstraints();
    await seedGraph();
  } catch (error) {
    startupWarning = (error as Error).message;
    // eslint-disable-next-line no-console
    console.error("Neo4j bootstrap failed. Starting API in degraded mode.", error);
  }

  const port = Number(process.env.PORT ?? 3001);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`MedMemory server running on port ${port}`);
    if (startupWarning) {
      // eslint-disable-next-line no-console
      console.warn(`Startup warning: ${startupWarning}`);
    }
  });
}

void start();
