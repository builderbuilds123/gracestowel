const SENSITIVE_KEYS = new Set([
  "email",
  "phone",
  "first_name",
  "last_name",
  "name",
  "full_name",
  "address",
  "address_1",
  "address_2",
  "postal_code",
  "token",
  "authorization",
  "session",
  "jwt",
  "password",
  "secret",
  "api_key",
  "apikey",
]);

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX = /(\+?\d[\d\s().-]{6,}\d)/g;

const REDACTED = "[redacted]";

const maskStringValue = (value: string): string =>
  value.replace(EMAIL_REGEX, REDACTED).replace(PHONE_REGEX, REDACTED);

const maskScalar = (value: unknown): unknown =>
  typeof value === "string" ? REDACTED : REDACTED;

const maskValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item));
  }
  if (value && typeof value === "object") {
    return maskProperties(value as Record<string, unknown>);
  }
  if (typeof value === "string") {
    return maskStringValue(value);
  }
  return value;
};

export const maskProperties = (input: Record<string, unknown>): Record<string, unknown> => {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      output[key] = maskScalar(value);
      continue;
    }
    output[key] = maskValue(value);
  }
  return output;
};

export const normalizeEventName = (event: string): string => event.replace(/_/g, ".");

type AnalyticsContainer = {
  resolve: (
    key: typeof Modules.ANALYTICS
  ) => {
    track: (data: {
      event: string;
      actor_id?: string;
      properties?: Record<string, unknown>;
    }) => Promise<void> | void;
  };
};

type TrackEventOptions = {
  actorId?: string;
  properties?: Record<string, unknown>;
};

export const trackEvent = async (
  container: AnalyticsContainer,
  event: string,
  options: TrackEventOptions = {}
): Promise<void> => {
  try {
    const analyticsService = container.resolve(Modules.ANALYTICS);
    await analyticsService.track({
      event: normalizeEventName(event),
      actor_id: options.actorId,
      properties: options.properties ? maskProperties(options.properties) : undefined,
    });
  } catch {
    // Never block core flows on analytics failures
  }
};
import { Modules } from "@medusajs/framework/utils";
