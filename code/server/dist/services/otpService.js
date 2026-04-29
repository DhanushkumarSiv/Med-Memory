"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setOtpSender = setOtpSender;
exports.generateOtp = generateOtp;
exports.sendOtp = sendOtp;
exports.getLastDevOtp = getLastDevOtp;
exports.createOtpRecord = createOtpRecord;
exports.verifyOtp = verifyOtp;
exports.countRecentOtpRequests = countRecentOtpRequests;
exports.listPendingOtps = listPendingOtps;
exports.invalidateOtp = invalidateOtp;
const crypto_1 = __importDefault(require("crypto"));
const uuid_1 = require("uuid");
const neo4j_1 = require("../db/neo4j");
let lastDevOtp = null;
const mockOtpSender = {
    async sendOtp(phone, otp) {
        // eslint-disable-next-line no-console
        console.log(`\n[OTP SERVICE] Phone: ${phone} | OTP: ${otp}\n`);
    },
};
let activeOtpSender = mockOtpSender;
function setOtpSender(sender) {
    activeOtpSender = sender;
}
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
async function sendOtp(phone, otp) {
    lastDevOtp = otp;
    await activeOtpSender.sendOtp(phone, otp);
}
function getLastDevOtp() {
    return lastDevOtp;
}
async function createOtpRecord(patientId, phone, otp, purpose, context = {}) {
    const now = new Date();
    const createdAt = now.toISOString();
    const expiryMinutes = Number(process.env.OTP_EXPIRY_MINUTES ?? "5");
    const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000).toISOString();
    const otpId = (0, uuid_1.v4)();
    await (0, neo4j_1.runQuery)(`
    MATCH (p:Patient {id: $patientId})
    CREATE (o:OtpRecord {
      id: $otpId,
      code: $otp,
      purpose: $purpose,
      phone: $phone,
      used: false,
      expiresAt: $expiresAt,
      createdAt: $createdAt,
      attempts: 0,
      providerId: $providerId,
      providerName: $providerName
    })
    MERGE (p)-[:HAS_OTP]->(o)
    `, {
        patientId,
        otpId,
        otp,
        purpose,
        phone,
        expiresAt,
        createdAt,
        providerId: context.providerId ?? null,
        providerName: context.providerName ?? null,
    });
    return otpId;
}
function timingSafeCodeCompare(inputCode, storedCode) {
    const inputHash = crypto_1.default.createHash("sha256").update(inputCode).digest();
    const storedHash = crypto_1.default.createHash("sha256").update(storedCode).digest();
    return crypto_1.default.timingSafeEqual(inputHash, storedHash);
}
async function verifyOtp(patientId, code, purpose) {
    const records = await (0, neo4j_1.runQuery)(`
    MATCH (:Patient {id: $patientId})-[:HAS_OTP]->(o:OtpRecord)
    WHERE o.purpose = $purpose AND o.used = false
    RETURN o
    ORDER BY o.createdAt DESC
    LIMIT 1
    `, { patientId, purpose });
    if (records.length === 0) {
        return { valid: false, reason: "otp_not_found" };
    }
    const latestRecord = records[0];
    if (!latestRecord) {
        return { valid: false, reason: "otp_not_found" };
    }
    const otpRow = latestRecord.o;
    const now = new Date();
    const expiresAt = new Date(otpRow.expiresAt);
    if (expiresAt.getTime() < now.getTime()) {
        await (0, neo4j_1.runQuery)(`
      MATCH (o:OtpRecord {id: $otpId})
      SET o.used = true
      `, { otpId: otpRow.id });
        return { valid: false, reason: "otp_expired", otpId: otpRow.id };
    }
    const matches = timingSafeCodeCompare(code, otpRow.code);
    const attempts = otpRow.attempts ?? 0;
    if (!matches) {
        const nextAttempts = attempts + 1;
        const forceInvalidate = nextAttempts >= 3;
        await (0, neo4j_1.runQuery)(`
      MATCH (o:OtpRecord {id: $otpId})
      SET o.attempts = $attempts, o.used = CASE WHEN $forceInvalidate THEN true ELSE o.used END
      `, { otpId: otpRow.id, attempts: nextAttempts, forceInvalidate });
        return {
            valid: false,
            reason: forceInvalidate ? "otp_too_many_attempts" : "otp_invalid",
            otpId: otpRow.id,
        };
    }
    await (0, neo4j_1.runQuery)(`
    MATCH (o:OtpRecord {id: $otpId})
    SET o.used = true
    `, { otpId: otpRow.id });
    return { valid: true, otpId: otpRow.id };
}
async function countRecentOtpRequests(providerId, patientId) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rows = await (0, neo4j_1.runQuery)(`
    MATCH (:Patient {id: $patientId})-[:HAS_OTP]->(o:OtpRecord)
    WHERE o.providerId = $providerId AND o.purpose = 'provider-access-consent' AND o.createdAt >= $since
    RETURN count(o) AS count
    `, { providerId, patientId, since });
    return Number(rows[0]?.count ?? 0);
}
async function listPendingOtps(patientId) {
    const nowIso = new Date().toISOString();
    const rows = await (0, neo4j_1.runQuery)(`
    MATCH (:Patient {id: $patientId})-[:HAS_OTP]->(o:OtpRecord)
    WHERE o.used = false AND o.expiresAt > $nowIso AND o.purpose = 'provider-access-consent'
    RETURN o
    ORDER BY o.createdAt DESC
    `, { patientId, nowIso });
    return rows.map((row) => row.o);
}
async function invalidateOtp(otpId) {
    await (0, neo4j_1.runQuery)(`
    MATCH (o:OtpRecord {id: $otpId})
    SET o.used = true
    `, { otpId });
}
