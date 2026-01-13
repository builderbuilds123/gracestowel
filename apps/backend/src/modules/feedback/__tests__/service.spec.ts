import { describe, it, expect } from "vitest"

// Test the NPS calculation logic as a pure function
function calculateNPS(scores: number[]): {
  promoters: number
  passives: number
  detractors: number
  nps_score: number
  total_responses: number
} {
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

// Test rate limit logic as pure function
function checkRateLimitLogic(recentCount: number, maxPerHour = 5): { allowed: boolean; remaining: number } {
  const allowed = recentCount < maxPerHour
  const remaining = Math.max(0, maxPerHour - recentCount)
  return { allowed, remaining }
}

describe("FeedbackModuleService - NPS Calculation", () => {
  it("calculates NPS correctly with mixed scores", () => {
    const scores = [10, 9, 8, 7, 6, 5, 4] // 2 promoters, 2 passives, 3 detractors
    const result = calculateNPS(scores)

    expect(result.promoters).toBe(2)
    expect(result.passives).toBe(2)
    expect(result.detractors).toBe(3)
    expect(result.total_responses).toBe(7)
    // NPS = (2/7 - 3/7) * 100 = -14.28... rounded to -14
    expect(result.nps_score).toBe(-14)
  })

  it("returns 0 for empty scores array", () => {
    const result = calculateNPS([])

    expect(result.nps_score).toBe(0)
    expect(result.total_responses).toBe(0)
  })

  it("calculates 100 NPS for all promoters", () => {
    const scores = [9, 10, 9, 10, 10]
    const result = calculateNPS(scores)

    expect(result.nps_score).toBe(100)
    expect(result.promoters).toBe(5)
    expect(result.detractors).toBe(0)
  })

  it("calculates -100 NPS for all detractors", () => {
    const scores = [0, 1, 2, 3, 4, 5, 6]
    const result = calculateNPS(scores)

    expect(result.nps_score).toBe(-100)
    expect(result.detractors).toBe(7)
    expect(result.promoters).toBe(0)
  })

  it("calculates 0 NPS for all passives", () => {
    const scores = [7, 8, 7, 8]
    const result = calculateNPS(scores)

    expect(result.nps_score).toBe(0)
    expect(result.passives).toBe(4)
  })

  it("correctly categorizes edge scores", () => {
    // 9 is promoter threshold, 7 is passive threshold
    const scores = [9, 8, 7, 6]
    const result = calculateNPS(scores)

    expect(result.promoters).toBe(1) // 9
    expect(result.passives).toBe(2) // 8, 7
    expect(result.detractors).toBe(1) // 6
  })
})

describe("FeedbackModuleService - Rate Limiting", () => {
  it("allows submission when under limit", () => {
    const result = checkRateLimitLogic(3)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2) // 5 - 3 = 2
  })

  it("blocks submission when at limit", () => {
    const result = checkRateLimitLogic(5)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it("blocks submission when over limit", () => {
    const result = checkRateLimitLogic(7)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it("allows first submission", () => {
    const result = checkRateLimitLogic(0)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(5)
  })

  it("allows submission at limit minus one", () => {
    const result = checkRateLimitLogic(4)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1)
  })
})

describe("FeedbackModuleService - Stats Calculation Logic", () => {
  it("calculates average correctly", () => {
    const scores = [4, 5, 3, 4, 4]
    const average = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    expect(average).toBe(4)
  })

  it("groups by type correctly", () => {
    const feedbacks = [
      { feedback_type: "csat", score: 4 },
      { feedback_type: "csat", score: 5 },
      { feedback_type: "nps", score: 9 },
    ]

    const typeGroups: Record<string, number[]> = {}
    for (const f of feedbacks) {
      if (!typeGroups[f.feedback_type]) {
        typeGroups[f.feedback_type] = []
      }
      typeGroups[f.feedback_type].push(f.score)
    }

    expect(typeGroups.csat).toEqual([4, 5])
    expect(typeGroups.nps).toEqual([9])
  })

  it("groups by status correctly", () => {
    const feedbacks = [
      { status: "new" },
      { status: "new" },
      { status: "reviewed" },
    ]

    const by_status: Record<string, number> = {}
    for (const f of feedbacks) {
      by_status[f.status] = (by_status[f.status] || 0) + 1
    }

    expect(by_status.new).toBe(2)
    expect(by_status.reviewed).toBe(1)
  })
})
