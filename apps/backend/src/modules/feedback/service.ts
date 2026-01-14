import { MedusaService } from "@medusajs/framework/utils"
import Feedback from "./models/feedback"

export interface FeedbackStats {
  total_count: number
  average_score: number
  by_type: Record<string, { count: number; average: number }>
  by_status: Record<string, number>
  nps_score?: number
}

export interface NPSBreakdown {
  promoters: number
  passives: number
  detractors: number
  nps_score: number
  total_responses: number
}

class FeedbackModuleService extends MedusaService({
  Feedback,
}) {
  /**
   * Get feedback statistics with optional filters
   */
  async getFeedbackStats(filters?: {
    from?: Date
    to?: Date
    feedback_type?: string
    page_route?: string
    product_id?: string
  }): Promise<FeedbackStats> {
    const queryFilters: Record<string, any> = {}

    if (filters?.feedback_type) {
      queryFilters.feedback_type = filters.feedback_type
    }
    if (filters?.page_route) {
      queryFilters.page_route = filters.page_route
    }
    if (filters?.product_id) {
      queryFilters.product_id = filters.product_id
    }
    // Filter by date range at database level for performance
    if (filters?.from || filters?.to) {
      queryFilters.submitted_at = {}
      if (filters?.from) {
        queryFilters.submitted_at.$gte = filters.from
      }
      if (filters?.to) {
        queryFilters.submitted_at.$lte = filters.to
      }
    }

    const filtered = await this.listFeedbacks(queryFilters)

    if (filtered.length === 0) {
      return {
        total_count: 0,
        average_score: 0,
        by_type: {},
        by_status: {},
      }
    }

    // Calculate stats
    const total_count = filtered.length
    const average_score =
      Math.round((filtered.reduce((sum, f) => sum + f.score, 0) / total_count) * 10) / 10

    // Group by type
    const by_type: Record<string, { count: number; average: number }> = {}
    const typeGroups: Record<string, number[]> = {}
    for (const f of filtered) {
      if (!typeGroups[f.feedback_type]) {
        typeGroups[f.feedback_type] = []
      }
      typeGroups[f.feedback_type].push(f.score)
    }
    for (const [type, scores] of Object.entries(typeGroups)) {
      by_type[type] = {
        count: scores.length,
        average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      }
    }

    // Group by status
    const by_status: Record<string, number> = {}
    for (const f of filtered) {
      by_status[f.status] = (by_status[f.status] || 0) + 1
    }

    // Calculate NPS if we have NPS responses
    const npsResponses = filtered.filter((f) => f.feedback_type === "nps")
    let nps_score: number | undefined
    if (npsResponses.length > 0) {
      const breakdown = this.calculateNPS(npsResponses.map((f) => f.score))
      nps_score = breakdown.nps_score
    }

    return {
      total_count,
      average_score,
      by_type,
      by_status,
      nps_score,
    }
  }

  /**
   * Get average satisfaction score for a specific page route
   */
  async getAverageScoreByRoute(route: string): Promise<{ average: number; count: number }> {
    const feedbacks = await this.listFeedbacks({
      page_route: route,
      feedback_type: "csat",
    })

    if (feedbacks.length === 0) {
      return { average: 0, count: 0 }
    }

    const average =
      Math.round((feedbacks.reduce((sum, f) => sum + f.score, 0) / feedbacks.length) * 10) / 10

    return { average, count: feedbacks.length }
  }

  /**
   * Get average satisfaction score for a specific product
   */
  async getAverageScoreByProduct(productId: string): Promise<{ average: number; count: number }> {
    const feedbacks = await this.listFeedbacks({
      product_id: productId,
    })

    if (feedbacks.length === 0) {
      return { average: 0, count: 0 }
    }

    const average =
      Math.round((feedbacks.reduce((sum, f) => sum + f.score, 0) / feedbacks.length) * 10) / 10

    return { average, count: feedbacks.length }
  }

  /**
   * Calculate NPS score from an array of scores (0-10)
   * NPS = %Promoters (9-10) - %Detractors (0-6)
   */
  calculateNPS(scores: number[]): NPSBreakdown {
    if (scores.length === 0) {
      return {
        promoters: 0,
        passives: 0,
        detractors: 0,
        nps_score: 0,
        total_responses: 0,
      }
    }

    let promoters = 0
    let passives = 0
    let detractors = 0

    for (const score of scores) {
      if (score >= 9) {
        promoters++
      } else if (score >= 7) {
        passives++
      } else {
        detractors++
      }
    }

    const total = scores.length
    const nps_score = Math.round(((promoters - detractors) / total) * 100)

    return {
      promoters,
      passives,
      detractors,
      nps_score,
      total_responses: total,
    }
  }

  /**
   * Get NPS breakdown for a date range
   */
  async getNPSBreakdown(filters?: { from?: Date; to?: Date }): Promise<NPSBreakdown> {
    const feedbacks = await this.listFeedbacks({ feedback_type: "nps" })

    let filtered = feedbacks
    if (filters?.from) {
      filtered = filtered.filter((f) => new Date(f.submitted_at) >= filters.from!)
    }
    if (filters?.to) {
      filtered = filtered.filter((f) => new Date(f.submitted_at) <= filters.to!)
    }

    return this.calculateNPS(filtered.map((f) => f.score))
  }

  /**
   * List feedback pending review
   */
  async listPendingFeedback(limit = 50): Promise<any[]> {
    const [feedbacks] = await this.listAndCountFeedbacks(
      { status: "new" },
      { take: limit, order: { submitted_at: "DESC" } }
    )
    return feedbacks
  }

  /**
   * Mark feedback as reviewed
   */
  async markAsReviewed(
    feedbackId: string,
    reviewedBy: string,
    notes?: string
  ): Promise<void> {
    await this.updateFeedbacks({
      id: feedbackId,
      status: "reviewed",
      reviewed_by: reviewedBy,
      reviewed_at: new Date(),
      internal_notes: notes,
    })
  }

  /**
   * Check rate limit for a session (max 5 submissions per hour)
   */
  async checkRateLimit(sessionId: string): Promise<{ allowed: boolean; remaining: number }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    // Query database with date filter for performance
    const [, recentCount] = await this.listAndCountFeedbacks({
      session_id: sessionId,
      submitted_at: { $gte: oneHourAgo },
    })

    const maxPerHour = 5
    const allowed = recentCount < maxPerHour
    const remaining = Math.max(0, maxPerHour - recentCount)

    return { allowed, remaining }
  }
}

export default FeedbackModuleService
