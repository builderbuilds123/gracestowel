import { describe, expect, it, vi } from "vitest";
import { maskEmail, maskEmailsInText } from "../../src/utils/email-masking"

describe("maskEmail", () => {
  it("masks standard email addresses", () => {
    expect(maskEmail("john.doe@example.com")).toBe("j*******@example.com")
    expect(maskEmail("alice@gmail.com")).toBe("a****@gmail.com")
    expect(maskEmail("bob.smith@company.co.uk")).toBe("b*******@company.co.uk")
  })

  it("preserves domain", () => {
    const result = maskEmail("test@specific-domain.com")
    expect(result).toContain("@specific-domain.com")
  })

  it("handles short local parts", () => {
    expect(maskEmail("a@b.co")).toBe("a@b.co")
    expect(maskEmail("ab@test.com")).toBe("ab@test.com")
  })

  it("handles null and undefined", () => {
    expect(maskEmail(null)).toBe("[invalid-email]")
    expect(maskEmail(undefined)).toBe("[invalid-email]")
  })

  it("handles invalid emails", () => {
    expect(maskEmail("not-an-email")).toBe("[invalid-email]")
    expect(maskEmail("@nodomain.com")).toBe("[invalid-email]")
    expect(maskEmail("noat")).toBe("[invalid-email]")
    expect(maskEmail("")).toBe("[invalid-email]")
    expect(maskEmail("ab@c@d.com")).toBe("[invalid-email]")
  })

  it("handles emails with special characters", () => {
    expect(maskEmail("user+tag@example.com")).toBe("u*******@example.com")
    expect(maskEmail("first.last@example.com")).toBe("f*******@example.com")
  })

  it("caps asterisks at 7", () => {
    const result = maskEmail("verylonglocalpart@example.com")
    expect(result).toBe("v*******@example.com")
  })
})

describe("maskEmailsInText", () => {
  it("masks emails in text", () => {
    const text = "Contact john@example.com or jane@test.org for help"
    const result = maskEmailsInText(text)
    expect(result).toBe("Contact j***@example.com or j***@test.org for help")
  })

  it("handles text without emails", () => {
    const text = "No emails here"
    expect(maskEmailsInText(text)).toBe("No emails here")
  })
})
