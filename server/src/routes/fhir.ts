import express, { Request, Response } from "express";
import { getFhirBundleByAbhaId, getFhirPatientByAbhaId } from "../fhir/mockEndpoints";

const router = express.Router();

router.get("/Patient/:abhaId", (req: Request, res: Response) => {
  const patient = getFhirPatientByAbhaId(String(req.params.abhaId ?? ""));
  if (!patient) {
    res.status(404).json({ message: "FHIR patient not found" });
    return;
  }

  res.json(patient);
});

router.get("/Bundle/:abhaId", (req: Request, res: Response) => {
  const bundle = getFhirBundleByAbhaId(String(req.params.abhaId ?? ""));
  if (!bundle) {
    res.status(404).json({ message: "FHIR bundle not found" });
    return;
  }

  res.json(bundle);
});

export default router;
