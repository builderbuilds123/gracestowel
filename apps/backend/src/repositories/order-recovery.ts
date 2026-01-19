/**
 * Interface for database connection that supports raw queries.
 * Compatible with Medusa's PG_CONNECTION (node-postgres Pool).
 */
export interface PgConnection {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}

export interface RecoveryOrderRow {
  id: string;
  metadata: Record<string, any> | null;
  created_at: Date;
  status: string;
}

/**
 * Fetch pending orders flagged for recovery (needs_recovery=true) that also have a Stripe PI.
 * This pushes the JSONB predicate into the DB to avoid full-table scans in cron.
 * 
 * Uses PG_CONNECTION directly for raw SQL queries in Medusa v2.
 */
export async function getPendingRecoveryOrders(
  pgConnection: PgConnection,
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

  // Standard Medusa v2 PG_CONNECTION can be a Pool or a Knex instance
  if (typeof (pgConnection as any).query === 'function') {
    const result = await pgConnection.query<RecoveryOrderRow>(sql, params);
    return result.rows;
  } else if (typeof (pgConnection as any).raw === 'function') {
    const result = await (pgConnection as any).raw(sql.replace(/\$(\d+)/g, '?'), params);
    return result.rows;
  }
  
  throw new Error("Unsupported database connection type: neither .query() nor .raw() found");
}
