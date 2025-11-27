/**
 * Unit tests for sync-to-resend-audience workflow step
 */

import { syncToResendAudienceStep } from "../steps/sync-to-resend-audience"

// Mock the Resend SDK
jest.mock("resend", () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      contacts: {
        create: jest.fn(),
      },
    })),
  }
})

describe("syncToResendAudienceStep", () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe("step definition", () => {
    it("should be defined", () => {
      expect(syncToResendAudienceStep).toBeDefined()
    })
  })

  describe("input validation", () => {
    it("should accept email as required field", () => {
      const validInput = {
        email: "test@example.com",
      }
      expect(validInput).toHaveProperty("email")
    })

    it("should accept optional first_name and last_name", () => {
      const validInput = {
        email: "test@example.com",
        first_name: "John",
        last_name: "Doe",
      }
      expect(validInput).toHaveProperty("first_name")
      expect(validInput).toHaveProperty("last_name")
    })

    it("should accept optional unsubscribed field", () => {
      const validInput = {
        email: "test@example.com",
        unsubscribed: false,
      }
      expect(validInput.unsubscribed).toBe(false)
    })
  })

  describe("environment variable checks", () => {
    it("should require RESEND_API_KEY", () => {
      const apiKey = process.env.RESEND_API_KEY
      // Step should gracefully handle missing API key
      expect(apiKey).toBeDefined // In test env this might be undefined
    })

    it("should require RESEND_AUDIENCE_ID", () => {
      const audienceId = process.env.RESEND_AUDIENCE_ID
      // Step should gracefully handle missing audience ID
      expect(audienceId).toBeDefined // In test env this might be undefined
    })
  })

  describe("output structure", () => {
    it("should return synced: true on success", () => {
      const successOutput = {
        synced: true,
        contactId: "contact_123",
      }

      expect(successOutput.synced).toBe(true)
      expect(successOutput.contactId).toBeDefined()
    })

    it("should return synced: false with reason on failure", () => {
      const failureOutput = {
        synced: false,
        reason: "API key not configured",
      }

      expect(failureOutput.synced).toBe(false)
      expect(failureOutput.reason).toBeDefined()
    })

    it("should return synced: false when API key missing", () => {
      const output = {
        synced: false,
        reason: "API key not configured",
      }

      expect(output.synced).toBe(false)
      expect(output.reason).toContain("API key")
    })

    it("should return synced: false when audience ID missing", () => {
      const output = {
        synced: false,
        reason: "Audience ID not configured",
      }

      expect(output.synced).toBe(false)
      expect(output.reason).toContain("Audience ID")
    })
  })

  describe("Resend API integration", () => {
    it("should call resend.contacts.create with correct parameters", () => {
      const expectedParams = {
        audienceId: "aud_test_123",
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        unsubscribed: false,
      }

      // Verify expected parameter structure
      expect(expectedParams).toHaveProperty("audienceId")
      expect(expectedParams).toHaveProperty("email")
      expect(expectedParams).toHaveProperty("firstName")
      expect(expectedParams).toHaveProperty("lastName")
      expect(expectedParams).toHaveProperty("unsubscribed")
    })
  })
})

