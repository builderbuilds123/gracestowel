import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { setAnalyticsServiceForLogger } from "../utils/logger";

export default async function analyticsLoggerLoader(container: MedusaContainer) {
  const analyticsService = container.resolve(Modules.ANALYTICS);
  setAnalyticsServiceForLogger(analyticsService);
}
