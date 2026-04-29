import express, { Request, Response } from "express";
import { AgentOrchestrator } from "../agents/orchestrator";

const router = express.Router();
const orchestrator = new AgentOrchestrator();

router.post("/:patientId/run", async (req: Request, res: Response) => {
  try {
    const patientId = String(req.params.patientId ?? "");
    const data = await orchestrator.runPipeline(patientId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to run agents", error: (error as Error).message });
  }
});

export default router;
