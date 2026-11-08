import { AuditEnvelopeDto } from '@dine/contracts';

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /jwt/i,
  /cvv/i,
  /cvc/i,
  /card_number/i,
  /cardnumber/i,
  /pin/i,
  /vpa/i,
  /auth_code/i,
  /access_token/i,
  /refresh_token/i,
  /webhook_secret/i,
  /authorization/i,
  /api_key/i,
];

/**
 * Deeply scrubs sensitive keys (passwords, tokens, CVV, payment secrets, etc.)
 * from audit diffs, operational logs, and external export payloads.
 */
export function redactSensitiveData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Check if string contains JWT pattern or bearer token
    if (data.startsWith('Bearer ') || data.startsWith('ey')) {
      return '[REDACTED_TOKEN]' as unknown as T;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitive) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = redactSensitiveData(val);
      }
    }
    return cleaned as T;
  }

  return data;
}

/**
 * Masks customer email preserving domain for support correlation (e.g. a***e@example.com).
 */
export function maskEmail(email?: string | null): string | null {
  if (!email || !email.includes('@')) return email || null;
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Masks customer phone number (e.g. +919876543211 -> +9198*****211).
 */
export function maskPhone(phone?: string | null): string | null {
  if (!phone || phone.length < 7) return phone || null;
  const start = phone.slice(0, 5);
  const end = phone.slice(-3);
  return `${start}*****${end}`;
}

/**
 * Shared transactional helper to commit immutable audit records with actor,
 * request correlation, and reason in the same database transaction.
 */
export async function recordAuditLog(
  client: any,
  envelope: AuditEnvelopeDto
): Promise<string> {
  const auditId = (envelope as any).id || undefined;
  const cleanedDiff = envelope.diff ? redactSensitiveData(envelope.diff) : null;
  const cleanedMetadata = envelope.metadata ? redactSensitiveData(envelope.metadata) : {};

  const query = `
    INSERT INTO audit_logs (
      id,
      actor_id,
      actor_role,
      restaurant_id,
      action,
      entity_type,
      entity_id,
      diff,
      request_id,
      ip_address,
      reason,
      metadata
    )
    VALUES (
      COALESCE($1, gen_random_uuid()),
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12
    )
    RETURNING id
  `;

  const values = [
    auditId || null,
    envelope.actor_id || null,
    envelope.actor_role || 'USER',
    envelope.restaurant_id || null,
    envelope.action,
    envelope.entity_type,
    envelope.entity_id,
    cleanedDiff ? JSON.stringify(cleanedDiff) : null,
    envelope.request_id || null,
    envelope.ip_address || null,
    envelope.reason || null,
    JSON.stringify(cleanedMetadata),
  ];

  const res = await client.query(query, values);
  return res.rows[0]?.id;
}
