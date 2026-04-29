"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const neo4j_1 = require("../db/neo4j");
const seed_1 = require("../db/seed");
const otpService_1 = require("../services/otpService");
const router = express_1.default.Router();
let demoRepairInFlight = null;
const defaultScopes = [
    "patient:read",
    "patient:fhir",
    "patient:run-pipeline",
    "patient:query",
    "consent:read",
    "audit:read",
];
const DEMO_PATIENT_ABHA = "ABHA-1001-2024";
const DEMO_PATIENT_PASSWORD = "Demo@1234";
const DEMO_PROVIDER_LOGIN = "dr.meera@medmemory.in";
const DEMO_PROVIDER_PASSWORD = "Doctor@1234";
function buildToken(payload) {
    const options = {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? "8h"),
    };
    return jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET ?? "medmemory-dev-secret", {
        ...options,
    });
}
function maskedPhone(phone) {
    if (phone.length < 4) {
        return "****";
    }
    return `${phone.slice(0, 3)} ****${phone.slice(-4)}`;
}
function parseBearer(req) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
        return null;
    }
    return auth.split(" ")[1] ?? null;
}
function verifyToken(token) {
    return jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET ?? "medmemory-dev-secret");
}
function calcAge(dobIso) {
    const birth = new Date(dobIso);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
        age -= 1;
    }
    return age;
}
async function ensureDemoSeedData() {
    if (!demoRepairInFlight) {
        demoRepairInFlight = (0, seed_1.seedGraph)().finally(() => {
            demoRepairInFlight = null;
        });
    }
    await demoRepairInFlight;
}
router.post("/patient/login", async (req, res) => {
    try {
        const { abhaId, password } = req.body;
        if (!abhaId || !password) {
            return res
                .status(400)
                .json({ message: "abhaId and password are required" });
        }
        const normalizedAbhaId = abhaId.trim().toUpperCase();
        let rows = await (0, neo4j_1.runQuery)(`
      MATCH (p:Patient {abhaId: $abhaId})
      RETURN p
      LIMIT 1
      `, { abhaId: normalizedAbhaId });
        let patient = rows[0]?.p;
        let isValid = patient
            ? await bcrypt_1.default.compare(password, String(patient.passwordHash))
            : false;
        if ((!patient || !isValid) &&
            normalizedAbhaId === DEMO_PATIENT_ABHA &&
            password === DEMO_PATIENT_PASSWORD) {
            await ensureDemoSeedData();
            rows = await (0, neo4j_1.runQuery)(`
        MATCH (p:Patient {abhaId: $abhaId})
        RETURN p
        LIMIT 1
        `, { abhaId: normalizedAbhaId });
            patient = rows[0]?.p;
            isValid = patient
                ? await bcrypt_1.default.compare(password, String(patient.passwordHash))
                : false;
        }
        if (!patient || !isValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        const token = buildToken({
            role: "patient",
            abhaId: normalizedAbhaId,
            patientId: patient.id,
        });
        return res.json({
            token,
            role: "patient",
            patient: {
                id: patient.id,
                name: patient.name,
                abhaId: patient.abhaId,
                dob: patient.dob,
                gender: patient.gender,
                phone: maskedPhone(String(patient.phone)),
            },
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({
            message: "Patient login failed",
            error: error.message,
        });
    }
});
router.post("/provider/login", async (req, res) => {
    try {
        const { loginId, password } = req.body;
        if (!loginId || !password) {
            return res
                .status(400)
                .json({ message: "loginId and password are required" });
        }
        const normalizedLoginId = loginId.trim().toLowerCase();
        let rows = await (0, neo4j_1.runQuery)(`
      MATCH (pr:Provider)
      WHERE toLower(pr.loginId) = $loginId
      RETURN pr
      LIMIT 1
      `, { loginId: normalizedLoginId });
        let provider = rows[0]?.pr;
        let isValid = provider
            ? await bcrypt_1.default.compare(password, String(provider.passwordHash))
            : false;
        if ((!provider || !isValid) &&
            normalizedLoginId === DEMO_PROVIDER_LOGIN &&
            password === DEMO_PROVIDER_PASSWORD) {
            await ensureDemoSeedData();
            rows = await (0, neo4j_1.runQuery)(`
        MATCH (pr:Provider)
        WHERE toLower(pr.loginId) = $loginId
        RETURN pr
        LIMIT 1
        `, { loginId: normalizedLoginId });
            provider = rows[0]?.pr;
            isValid = provider
                ? await bcrypt_1.default.compare(password, String(provider.passwordHash))
                : false;
        }
        if (!provider || !isValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        const providerSessionToken = buildToken({
            role: "provider",
            providerId: provider.id,
            providerName: provider.name,
            providerType: provider.type,
            authorised: false,
        });
        return res.json({
            providerSessionToken,
            role: "provider",
            authorised: false,
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({
            message: "Provider login failed",
            error: error.message,
        });
    }
});
router.post("/provider/lookup-patient", async (req, res) => {
    try {
        const token = parseBearer(req);
        if (!token) {
            return res.status(401).json({ message: "Missing authorization token" });
        }
        const payload = verifyToken(token);
        if (payload.role !== "provider") {
            return res.status(403).json({ message: "Only provider session allowed" });
        }
        const { abhaId } = req.body;
        if (!abhaId) {
            return res.status(400).json({ message: "abhaId is required" });
        }
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (p:Patient {abhaId: $abhaId})
      RETURN p
      LIMIT 1
      `, { abhaId });
        const patient = rows[0]?.p;
        if (!patient) {
            return res.status(404).json({ message: "Patient not found" });
        }
        return res.json({
            patientId: patient.id,
            name: patient.name,
            age: calcAge(String(patient.dob)),
            gender: patient.gender,
            maskedPhone: maskedPhone(String(patient.phone)),
            abhaId: patient.abhaId,
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "Lookup failed", error: error.message });
    }
});
router.post("/provider/request-otp", async (req, res) => {
    try {
        const token = parseBearer(req);
        if (!token) {
            return res.status(401).json({ message: "Missing authorization token" });
        }
        const payload = verifyToken(token);
        if (payload.role !== "provider") {
            return res.status(403).json({ message: "Only provider session allowed" });
        }
        const { patientId } = req.body;
        if (!patientId || !payload.providerId) {
            return res.status(400).json({ message: "patientId is required" });
        }
        const rows = await (0, neo4j_1.runQuery)(`
      MATCH (p:Patient {id: $patientId})
      RETURN p
      LIMIT 1
      `, { patientId });
        const patient = rows[0]?.p;
        if (!patient) {
            return res.status(404).json({ message: "Patient not found" });
        }
        const otp = (0, otpService_1.generateOtp)();
        await (0, otpService_1.createOtpRecord)(patientId, String(patient.phone), otp, "provider-access-consent", {
            providerId: payload.providerId,
            providerName: payload.providerName,
        });
        await (0, otpService_1.sendOtp)(String(patient.phone), otp);
        return res.json({
            otpSent: true,
            maskedPhone: maskedPhone(String(patient.phone)),
            expiresIn: Number(process.env.OTP_EXPIRY_MINUTES ?? "5") * 60,
            devOtp: process.env.NODE_ENV === "production" ? null : (0, otpService_1.getLastDevOtp)(),
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({ message: "OTP request failed", error: error.message });
    }
});
router.post("/provider/verify-otp", async (req, res) => {
    try {
        const token = parseBearer(req);
        if (!token) {
            return res.status(401).json({ message: "Missing authorization token" });
        }
        const payload = verifyToken(token);
        if (payload.role !== "provider" ||
            !payload.providerId ||
            !payload.providerName) {
            return res.status(403).json({ message: "Only provider session allowed" });
        }
        const { patientId, otp } = req.body;
        if (!patientId || !otp) {
            return res
                .status(400)
                .json({ message: "patientId and otp are required" });
        }
        const verification = await (0, otpService_1.verifyOtp)(patientId, otp, "provider-access-consent");
        if (!verification.valid) {
            const reasonMap = {
                otp_not_found: "No pending OTP found",
                otp_expired: "OTP expired",
                otp_invalid: "Invalid OTP",
                otp_too_many_attempts: "OTP invalidated after 3 failed attempts",
            };
            return res
                .status(401)
                .json({
                message: reasonMap[verification.reason ?? ""] ?? "OTP verification failed",
            });
        }
        const consentRows = await (0, neo4j_1.runQuery)(`
      MATCH (:Patient {id: $patientId})-[:GRANTED_ACCESS_TO]->(c:ConsentToken)-[:AUTHORISES]->(:Provider {id: $providerId})
      WHERE c.revokedAt IS NULL AND c.expiresAt > $nowIso
      RETURN c
      ORDER BY c.expiresAt DESC
      LIMIT 1
      `, {
            patientId,
            providerId: payload.providerId,
            nowIso: new Date().toISOString(),
        });
        let consentToken = consentRows[0]?.c?.token;
        let scopes = defaultScopes;
        if (!consentToken) {
            consentToken = (0, uuid_1.v4)();
            const consentId = (0, uuid_1.v4)();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
            scopes = [...defaultScopes];
            await (0, neo4j_1.runQuery)(`
        MATCH (p:Patient {id: $patientId})
        MATCH (pr:Provider {id: $providerId})
        CREATE (c:ConsentToken {
          id: $consentId,
          token: $token,
          providerName: $providerName,
          providerType: $providerType,
          scopes: $scopes,
          grantedAt: $grantedAt,
          expiresAt: $expiresAt,
          revokedAt: null
        })
        MERGE (p)-[:GRANTED_ACCESS_TO]->(c)
        MERGE (c)-[:AUTHORISES]->(pr)
        `, {
                patientId,
                providerId: payload.providerId,
                consentId,
                token: consentToken,
                providerName: payload.providerName,
                providerType: payload.providerType ?? "clinician",
                scopes: JSON.stringify(scopes),
                grantedAt: now.toISOString(),
                expiresAt,
            });
        }
        else {
            const scopeString = consentRows[0]?.c?.scopes;
            if (scopeString) {
                scopes = JSON.parse(scopeString);
            }
        }
        const fullAccessToken = buildToken({
            role: "provider",
            providerId: payload.providerId,
            providerName: payload.providerName,
            patientId,
            authorised: true,
            scopes,
            consentToken,
        });
        await (0, neo4j_1.runQuery)(`
      MATCH (p:Patient {id: $patientId})
      CREATE (a:AuditEntry {
        id: $id,
        accessor: $accessor,
        action: 'otp-consent-granted',
        resourceAccessed: $resourceAccessed,
        consentTokenUsed: $consentTokenUsed,
        accessedAt: $accessedAt
      })
      MERGE (p)-[:HAS_AUDIT_ENTRY]->(a)
      `, {
            patientId,
            id: (0, uuid_1.v4)(),
            accessor: payload.providerName,
            resourceAccessed: patientId,
            consentTokenUsed: consentToken,
            accessedAt: new Date().toISOString(),
        });
        return res.json({
            token: fullAccessToken,
            role: "provider",
            authorised: true,
            patientId,
            scopes,
        });
    }
    catch (error) {
        return res
            .status(500)
            .json({
            message: "OTP verification failed",
            error: error.message,
        });
    }
});
router.post("/logout", (_req, res) => {
    return res.json({ success: true });
});
router.get("/me", (req, res) => {
    try {
        const token = parseBearer(req);
        if (!token) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const payload = verifyToken(token);
        return res.json(payload);
    }
    catch (error) {
        return res
            .status(401)
            .json({ message: "Invalid token", error: error.message });
    }
});
router.get("/dev/last-otp", (_req, res) => {
    if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ message: "Not found" });
    }
    return res.json({ otp: (0, otpService_1.getLastDevOtp)() });
});
exports.default = router;
