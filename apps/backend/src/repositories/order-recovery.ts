import { EntityManager } from "typeorm";

export interface RecoveryOrderRow {
  id: string;
  metadata: Record<string, any> | null;
  created_at: Date;
  status: string;
}

/**
 * Fetch pending orders flagged for recovery (needs_recovery=true) that also have a Stripe PI.
 * This pushes the JSONB predicate into the DB to avoid full-table scans in cron.
 */
export async function getPendingRecoveryOrders(
  manager: EntityManager,
  olderThan?: Date
): Promise<RecoveryOrderRow[]> {
  const params: any[] = [];
  let where =
    "status = 'pending'" +
    " AND metadata->>'stripe_payment_intent_id' IS NOT NULL" +
    " AND metadata->>'needs_recovery' = 'true'";

  if (olderThan) {
    params.push(olderThan);
    where += ` AND created_at < $${params.length}`;
  }

  const sql = `
    SELECT id, metadata, created_at, status
      FROM "order"
     WHERE ${where}
  `;

  return manager.query(sql, params);
}
