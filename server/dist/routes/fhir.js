"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mockEndpoints_1 = require("../fhir/mockEndpoints");
const router = express_1.default.Router();
router.get("/Patient/:abhaId", (req, res) => {
    const patient = (0, mockEndpoints_1.getFhirPatientByAbhaId)(String(req.params.abhaId ?? ""));
    if (!patient) {
        res.status(404).json({ message: "FHIR patient not found" });
        return;
    }
    res.json(patient);
});
router.get("/Bundle/:abhaId", (req, res) => {
    const bundle = (0, mockEndpoints_1.getFhirBundleByAbhaId)(String(req.params.abhaId ?? ""));
    if (!bundle) {
        res.status(404).json({ message: "FHIR bundle not found" });
        return;
    }
    res.json(bundle);
});
exports.default = router;
