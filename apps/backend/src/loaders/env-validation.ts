import type { LoaderOptions, Logger, MedusaContainer } from '@medusajs/framework/types';
import { validateBackendEnvWithIssues } from '../lib/env';

/**
 * Medusa loader to validate environment variables at startup.
 * This runs before the application fully initializes, ensuring
 * that all required environment variables are present.
 *
 * If validation fails, the application will not start.
 */
export default async function envValidationLoader(
  container: MedusaContainer,
  options: LoaderOptions
) {
  const logger = container.resolve<Logger>('logger');

  logger.info('[ENV Loader] Validating environment variables...');

  const { env, issues, warnings } = validateBackendEnvWithIssues();

  // Log any warnings for optional variables
  for (const warning of warnings) {
    logger.warn(`[ENV Loader] ${warning}`);
  }

  // If validation failed, log all issues and throw
  if (!env) {
    logger.error('[ENV Loader] Environment validation FAILED. Application cannot start.');
    for (const issue of issues) {
      logger.error(`[ENV Loader] ${issue.path.join('.')}: ${issue.message}`);
    }
    throw new Error('Environment validation failed. Check logs for details.');
  }

  logger.info('[ENV Loader] Environment validation passed.');
  logger.debug(`[ENV Loader] NODE_ENV: ${env.NODE_ENV}`);

  // DEBUG: Log payment capture delay configuration
  const paymentCaptureDelayMs = process.env.PAYMENT_CAPTURE_DELAY_MS;
  logger.info(`[ENV Loader][DEBUG] ====== PAYMENT CAPTURE CONFIGURATION ======`);
  logger.info(`[ENV Loader][DEBUG] PAYMENT_CAPTURE_DELAY_MS from env: "${paymentCaptureDelayMs}"`);
  if (paymentCaptureDelayMs) {
    const delayMs = parseInt(paymentCaptureDelayMs, 10);
    const delaySeconds = delayMs / 1000;
    const delayMinutes = Math.floor(delaySeconds / 60);
    const remainingSeconds = Math.round(delaySeconds % 60);
    logger.info(`[ENV Loader][DEBUG] Parsed value: ${delayMs}ms = ${delayMinutes} minutes ${remainingSeconds} seconds`);
  } else {
    logger.warn(`[ENV Loader][DEBUG] PAYMENT_CAPTURE_DELAY_MS is NOT SET - will use default (~59 minutes)`);
  }
  logger.info(`[ENV Loader][DEBUG] CAPTURE_BUFFER_SECONDS from env: "${process.env.CAPTURE_BUFFER_SECONDS || '30 (default)'}"`)
  logger.info(`[ENV Loader][DEBUG] REDIS_URL configured: ${!!process.env.REDIS_URL}`);
  logger.info(`[ENV Loader][DEBUG] =============================================`);
}
