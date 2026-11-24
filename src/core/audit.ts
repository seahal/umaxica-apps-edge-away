type AuditEvent = 'away_accepted' | 'away_rejected' | 'away_rate_limit_failed';

type AuditRecord = {
  event: AuditEvent;
  requestId: string;
  status: number;
  cfRay?: string;
  iss?: string;
  reason?: string;
};

export function logAudit(record: AuditRecord) {
  const { event, requestId, status, cfRay, iss, reason } = record;
  const line = JSON.stringify({
    event,
    request_id: requestId,
    status,
    ...(cfRay ? { cf_ray: cfRay } : {}),
    ...(iss ? { iss } : {}),
    ...(reason ? { reason } : {}),
  });
  if (event === 'away_rate_limit_failed') {
    // eslint-disable-next-line no-console -- bounded fields only; never include request data.
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console -- bounded fields only; never include request data.
    console.info(line);
  }
}
