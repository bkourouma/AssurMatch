/**
 * Spec 075 FR-B1: observable state of the audit pipeline. A failed `AuditLogWriter.write` is no
 * longer silent: it is counted here, retried from a bounded in-memory outbox, and only counted as
 * dropped when the outbox overflows (or an entry exhausts its attempts). Counters hold numbers only,
 * never an action name, an identifier or a context, so they are safe in metrics and health.
 */
export interface AuditReliabilitySnapshot {
  /** Cumulative persistence failures of `write()` (each failed attempt, including retries). */
  auditPersistFailures: number;
  /** Entries currently waiting in the outbox for a retry. */
  auditOutboxDepth: number;
  /** Cumulative entries abandoned (outbox overflow or attempts exhausted): audit rows LOST. */
  auditDropped: number;
}

const state: AuditReliabilitySnapshot = { auditPersistFailures: 0, auditOutboxDepth: 0, auditDropped: 0 };

export const auditReliability = {
  recordPersistFailure(): void {
    state.auditPersistFailures += 1;
  },
  recordDropped(): void {
    state.auditDropped += 1;
  },
  adjustOutboxDepth(delta: number): void {
    state.auditOutboxDepth = Math.max(0, state.auditOutboxDepth + delta);
  },
  snapshot(): AuditReliabilitySnapshot {
    return { ...state };
  },
  reset(): void {
    state.auditPersistFailures = 0;
    state.auditOutboxDepth = 0;
    state.auditDropped = 0;
  }
};

/** Prometheus text lines (0.0.4) appended to the existing `/metrics` output. */
export function renderAuditMetrics(snapshot: AuditReliabilitySnapshot = auditReliability.snapshot()): string[] {
  return [
    "# HELP assurmatch_audit_persist_failures_total Audit log persistence failures (cumulative, each attempt).",
    "# TYPE assurmatch_audit_persist_failures_total counter",
    `assurmatch_audit_persist_failures_total ${snapshot.auditPersistFailures}`,
    "# HELP assurmatch_audit_outbox_depth Audit entries waiting in the in-memory outbox for a retry.",
    "# TYPE assurmatch_audit_outbox_depth gauge",
    `assurmatch_audit_outbox_depth ${snapshot.auditOutboxDepth}`,
    "# HELP assurmatch_audit_dropped_total Audit entries lost (outbox overflow or attempts exhausted).",
    "# TYPE assurmatch_audit_dropped_total counter",
    `assurmatch_audit_dropped_total ${snapshot.auditDropped}`
  ];
}
