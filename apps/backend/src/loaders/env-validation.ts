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
}
