import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { runQuery } from "../db/neo4j";

interface OtpSender {
  sendOtp: (phone: string, otp: string) => Promise<void>;
}

interface OtpRow {
  id: string;
  code: string;
  used: boolean;
  expiresAt: string;
  attempts?: number;
}

export interface OtpContext {
  providerId?: string;
  providerName?: string;
}

let lastDevOtp: string | null = null;

const mockOtpSender: OtpSender = {
  async sendOtp(phone: string, otp: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`\n[OTP SERVICE] Phone: ${phone} | OTP: ${otp}\n`);
  },
};

let activeOtpSender: OtpSender = mockOtpSender;

export function setOtpSender(sender: OtpSender): void {
  activeOtpSender = sender;
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtp(phone: string, otp: string): Promise<void> {
  lastDevOtp = otp;
  await activeOtpSender.sendOtp(phone, otp);
}

export function getLastDevOtp(): string | null {
  return lastDevOtp;
}

export async function createOtpRecord(
  patientId: string,
  phone: string,
  otp: string,
  purpose: string,
  context: OtpContext = {}
): Promise<string> {
  const now = new Date();
  const createdAt = now.toISOString();
  const expiryMinutes = Number(process.env.OTP_EXPIRY_MINUTES ?? "5");
  const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000).toISOString();
  const otpId = uuidv4();

  await runQuery(
    `
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
    `,
    {
      patientId,
      otpId,
      otp,
      purpose,
      phone,
      expiresAt,
      createdAt,
      providerId: context.providerId ?? null,
      providerName: context.providerName ?? null,
    }
  );

  return otpId;
}

function timingSafeCodeCompare(inputCode: string, storedCode: string): boolean {
  const inputHash = crypto.createHash("sha256").update(inputCode).digest();
  const storedHash = crypto.createHash("sha256").update(storedCode).digest();
  return crypto.timingSafeEqual(inputHash, storedHash);
}

export async function verifyOtp(
  patientId: string,
  code: string,
  purpose: string
): Promise<{ valid: boolean; reason?: string; otpId?: string }> {
  const records = await runQuery<{ o: OtpRow }>(
    `
    MATCH (:Patient {id: $patientId})-[:HAS_OTP]->(o:OtpRecord)
    WHERE o.purpose = $purpose AND o.used = false
    RETURN o
    ORDER BY o.createdAt DESC
    LIMIT 1
    `,
    { patientId, purpose }
  );

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
    await runQuery(
      `
      MATCH (o:OtpRecord {id: $otpId})
      SET o.used = true
      `,
      { otpId: otpRow.id }
    );
    return { valid: false, reason: "otp_expired", otpId: otpRow.id };
  }

  const matches = timingSafeCodeCompare(code, otpRow.code);
  const attempts = otpRow.attempts ?? 0;

  if (!matches) {
    const nextAttempts = attempts + 1;
    const forceInvalidate = nextAttempts >= 3;

    await runQuery(
      `
      MATCH (o:OtpRecord {id: $otpId})
      SET o.attempts = $attempts, o.used = CASE WHEN $forceInvalidate THEN true ELSE o.used END
      `,
      { otpId: otpRow.id, attempts: nextAttempts, forceInvalidate }
    );

    return {
      valid: false,
      reason: forceInvalidate ? "otp_too_many_attempts" : "otp_invalid",
      otpId: otpRow.id,
    };
  }

  await runQuery(
    `
    MATCH (o:OtpRecord {id: $otpId})
    SET o.used = true
    `,
    { otpId: otpRow.id }
  );

  return { valid: true, otpId: otpRow.id };
}

export async function countRecentOtpRequests(providerId: string, patientId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const rows = await runQuery<{ count: number }>(
    `
    MATCH (:Patient {id: $patientId})-[:HAS_OTP]->(o:OtpRecord)
    WHERE o.providerId = $providerId AND o.purpose = 'provider-access-consent' AND o.createdAt >= $since
    RETURN count(o) AS count
    `,
    { providerId, patientId, since }
  );

  return Number(rows[0]?.count ?? 0);
}

export async function listPendingOtps(patientId: string): Promise<Array<Record<string, unknown>>> {
  const nowIso = new Date().toISOString();
  const rows = await runQuery<{ o: Record<string, unknown> }>(
    `
    MATCH (:Patient {id: $patientId})-[:HAS_OTP]->(o:OtpRecord)
    WHERE o.used = false AND o.expiresAt > $nowIso AND o.purpose = 'provider-access-consent'
    RETURN o
    ORDER BY o.createdAt DESC
    `,
    { patientId, nowIso }
  );

  return rows.map((row) => row.o);
}

export async function invalidateOtp(otpId: string): Promise<void> {
  await runQuery(
    `
    MATCH (o:OtpRecord {id: $otpId})
    SET o.used = true
    `,
    { otpId }
  );
}
