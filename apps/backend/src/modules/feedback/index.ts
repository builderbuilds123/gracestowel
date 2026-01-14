import { Module } from "@medusajs/framework/utils"
import FeedbackModuleService from "./service"

export const FEEDBACK_MODULE = "feedback"

export default Module(FEEDBACK_MODULE, {
  service: FeedbackModuleService,
})

export type { FeedbackModuleService }
