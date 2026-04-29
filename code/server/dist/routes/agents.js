"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const orchestrator_1 = require("../agents/orchestrator");
const router = express_1.default.Router();
const orchestrator = new orchestrator_1.AgentOrchestrator();
router.post("/:patientId/run", async (req, res) => {
    try {
        const patientId = String(req.params.patientId ?? "");
        const data = await orchestrator.runPipeline(patientId);
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ message: "Failed to run agents", error: error.message });
    }
});
exports.default = router;
