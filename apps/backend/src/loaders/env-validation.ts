import type { LoaderOptions, Logger, MedusaContainer } from '@medusajs/framework/types';
import { validateBackendEnvWithWarnings } from '../lib/env';

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

  try {
    logger.info('[ENV Loader] Validating environment variables...');
    const env = validateBackendEnvWithWarnings();
    logger.info('[ENV Loader] Environment validation passed.');
    logger.debug('[ENV Loader] NODE_ENV: ' + env.NODE_ENV);
  } catch (error) {
    logger.error('[ENV Loader] Environment validation FAILED. Application cannot start.');
    if (error instanceof Error) {
      logger.error('[ENV Loader] ' + error.message);
    }
    // Re-throw to prevent application startup
    throw error;
  }
}
