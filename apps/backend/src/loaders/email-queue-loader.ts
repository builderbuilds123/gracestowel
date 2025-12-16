import { MedusaContainer } from "@medusajs/framework/types";
import { initEmailQueue } from "../lib/email-queue";

export default async function emailQueueLoader(
  container: MedusaContainer
): Promise<void> {
  initEmailQueue(container);
}
