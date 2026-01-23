/**
 * Audit Logger for Order Modification Attempts
 * 
 * Story 2.5: Log all order modification attempts for compliance
 * 
 * Logs:
 * - Order ID
 * - Action type (view/edit/cancel)
 * - Auth method (guest_token/customer_session)
 * - Customer ID (if logged in)
 * - Token hash (first 16 chars of SHA256, if guest)
 * - IP address
 * - User agent
 * - Timestamp
 * - Success/failure
 * - Failure reason (if applicable)
 * 
 * @see docs/product/epics/order-modification-v2.md Story 2.5
 */

import crypto from "crypto";
import { logger } from "./logger";

export type AuditAction = "view" | "edit" | "cancel" | "eligibility_check";

export interface AuditLogData {
  orderId: string;
  action: AuditAction;
  authMethod: "guest_token" | "customer_session" | "none";
  customerId: string | null;
  token?: string; // Will be hashed
  ip: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
}

/**
 * Log order modification attempt for compliance
 * 
 * @param data - Audit log data
 */
export function logOrderModificationAttempt(data: AuditLogData): void {
  const tokenHash = data.token
    ? crypto.createHash("sha256").update(data.token).digest("hex").slice(0, 16)
    : null;

  logger.info("order-modification-audit", {
    orderId: data.orderId,
    action: data.action,
    authMethod: data.authMethod,
    customerId: data.customerId,
    tokenHash,
    ip: data.ip,
    userAgent: data.userAgent,
    timestamp: new Date().toISOString(),
    success: data.success,
    failureReason: data.failureReason || null,
  });
}
