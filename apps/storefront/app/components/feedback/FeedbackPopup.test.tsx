import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { FeedbackPopup } from "./FeedbackPopup"
import { RatingScale } from "./RatingScale"

// Mock hooks
vi.mock("../../context/CartContext", () => ({
  useCart: () => ({
    items: [],
    cartTotal: 0,
  }),
}))

vi.mock("../../context/CustomerContext", () => ({
  useCustomer: () => ({
    customer: null,
  }),
}))

describe("RatingScale", () => {
  it("renders CSAT scale with 5 emoji buttons", () => {
    const onChange = vi.fn()
    render(<RatingScale type="csat" value={null} onChange={onChange} />)

    // Should have 5 rating buttons
    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(5)
  })

  it("calls onChange when rating is clicked", () => {
    const onChange = vi.fn()
    render(<RatingScale type="csat" value={null} onChange={onChange} />)

    const buttons = screen.getAllByRole("button")
    fireEvent.click(buttons[2]) // Click middle rating (3)

    expect(onChange).toHaveBeenCalledWith(3)
  })

  it("renders NPS scale with 11 buttons (0-10)", () => {
    const onChange = vi.fn()
    render(<RatingScale type="nps" value={null} onChange={onChange} />)

    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(11)
  })

  it("renders CES scale with 7 buttons", () => {
    const onChange = vi.fn()
    render(<RatingScale type="ces" value={null} onChange={onChange} />)

    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(7)
  })

  it("shows selected state for chosen rating", () => {
    const onChange = vi.fn()
    render(<RatingScale type="csat" value={4} onChange={onChange} />)

    const buttons = screen.getAllByRole("button")
    // The 4th button (index 3) should be pressed
    expect(buttons[3]).toHaveAttribute("aria-pressed", "true")
  })
})

describe("FeedbackPopup", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue({ success: true }),
    surveyType: "csat" as const,
    triggerType: "floating_button",
    isSubmitting: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders when open", () => {
    render(<FeedbackPopup {...defaultProps} />)

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(/how satisfied are you/i)).toBeInTheDocument()
  })

  it("does not render when closed", () => {
    render(<FeedbackPopup {...defaultProps} isOpen={false} />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows NPS question for NPS survey type", () => {
    render(<FeedbackPopup {...defaultProps} surveyType="nps" />)

    expect(screen.getByText(/how likely are you to recommend/i)).toBeInTheDocument()
  })

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn()
    render(<FeedbackPopup {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText(/close feedback form/i))

    expect(onClose).toHaveBeenCalled()
  })

  it("calls onClose when Maybe Later is clicked", () => {
    const onClose = vi.fn()
    render(<FeedbackPopup {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByText(/maybe later/i))

    expect(onClose).toHaveBeenCalled()
  })

  it("disables submit button when no rating selected", () => {
    render(<FeedbackPopup {...defaultProps} />)

    const submitButton = screen.getByText(/submit feedback/i).closest("button")
    expect(submitButton).toBeDisabled()
  })

  it("calls onSubmit with score and comment when form is valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true })
    render(<FeedbackPopup {...defaultProps} onSubmit={onSubmit} />)

    // Select a rating
    const ratingButtons = screen.getAllByRole("button").filter(
      (btn) => btn.getAttribute("aria-label")?.includes("Rate")
    )
    fireEvent.click(ratingButtons[3]) // Rate 4

    // Add a comment
    const textarea = screen.getByPlaceholderText(/what could we improve/i)
    fireEvent.change(textarea, { target: { value: "Great experience!" } })

    // Submit
    fireEvent.click(screen.getByText(/submit feedback/i))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        score: 4,
        comment: "Great experience!",
      })
    })
  })

  it("shows thank you message after successful submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true })
    render(<FeedbackPopup {...defaultProps} onSubmit={onSubmit} />)

    // Select a rating and submit
    const ratingButtons = screen.getAllByRole("button").filter(
      (btn) => btn.getAttribute("aria-label")?.includes("Rate")
    )
    fireEvent.click(ratingButtons[4]) // Rate 5
    fireEvent.click(screen.getByText(/submit feedback/i))

    await waitFor(() => {
      expect(screen.getByText(/thank you/i)).toBeInTheDocument()
    })
  })

  it("disables submit button while submitting", () => {
    render(<FeedbackPopup {...defaultProps} isSubmitting={true} />)

    const submitButton = screen.getByText(/submitting/i).closest("button")
    expect(submitButton).toBeDisabled()
  })
})
