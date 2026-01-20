import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { trackEvent } from "../../utils/analytics";

type TrackWorkflowEventInput = {
  event: string;
  failureEvent?: string;
  actorId?: string;
  properties?: Record<string, unknown>;
};

export const trackWorkflowEventStep = createStep(
  "track-workflow-event",
  async (input: TrackWorkflowEventInput, { container }): Promise<StepResponse<void, { failureEvent?: string; actorId?: string; properties?: Record<string, unknown> }>> => {
    await trackEvent(container, input.event, {
      actorId: input.actorId,
      properties: input.properties,
    });
    return new StepResponse(undefined, {
      failureEvent: input.failureEvent,
      actorId: input.actorId,
      properties: input.properties,
    });
  },
  async (compensateInput, { container }) => {
    if (!compensateInput?.failureEvent) {
      return;
    }
    await trackEvent(container, compensateInput.failureEvent, {
      actorId: compensateInput.actorId,
      properties: compensateInput.properties,
    });
  }
);
