import { describe, expect, it, vi, beforeEach, Mock } from "vitest";
import ResendNotificationProviderService, { Templates } from "../../src/modules/resend/service";
import { Resend } from "resend";
import { render } from "@react-email/components";

// Mock resend
vi.mock("resend", () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn(),
      },
    })),
  };
});

// Mock react-email render
vi.mock("@react-email/components", () => ({
  render: vi.fn().mockResolvedValue("<html>mock html</html>"),
}));

describe("ResendNotificationProviderService", () => {
  let container: any;
  let logger: any;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    container = {
      logger,
    };
    
    // Default mock implementation
    (Resend as unknown as Mock).mockImplementation(function() {
      return {
        emails: {
          send: vi.fn().mockResolvedValue({ data: { id: "sent" } }),
        },
      };
    });
  });

  describe("constructor and validateOptions", () => {
    it("initializes in test mode when configured", () => {
      const service = new ResendNotificationProviderService(container, {
        test_mode: true,
      });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("test mode"));
    });

    it("initializes normally with api key", () => {
      const service = new ResendNotificationProviderService(container, {
        api_key: "test_key",
        from: "test@example.com",
      });
      expect(Resend).toHaveBeenCalledWith("test_key");
    });

    it("logs warning if no api key provided in non-test mode", () => {
      const service = new ResendNotificationProviderService(container, {
        from: "test@example.com",
      });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("No API key provided"));
    });

    it("validateOptions throws if missing required fields in non-test mode", () => {
      expect(() =>
        ResendNotificationProviderService.validateOptions({
          from: "test@example.com",
        } as any)
      ).toThrow("Resend API key is required");

      expect(() =>
        ResendNotificationProviderService.validateOptions({
          api_key: "test",
        } as any)
      ).toThrow("Resend from email is required");
    });

    it("validateOptions does not throw in test mode", () => {
      expect(() =>
        ResendNotificationProviderService.validateOptions({
          test_mode: true,
        })
      ).not.toThrow();
    });
  });

  describe("send", () => {
    it("skips sending in test mode", async () => {
      const service = new ResendNotificationProviderService(container, {
        test_mode: true,
      });
      const result = await service.send({
        to: "user@example.com",
        channel: "email",
        template: Templates.WELCOME,
        data: {},
      } as any);

      expect(result).toEqual({ id: "test-mode-skipped" });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Would send"));
    });

    it("skips if template not found", async () => {
      const service = new ResendNotificationProviderService(container, {
        api_key: "key",
        from: "test@example.com",
      });
      const result = await service.send({
        to: "user@example.com",
        channel: "email",
        template: "invalid-template",
        data: {},
      } as any);

      expect(result).toEqual({ id: "skipped" });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("No template found"));
    });

    it("sends email successfully", async () => {
      const mockSend = vi.fn().mockResolvedValue({ data: { id: "msg_123" } });
      (Resend as unknown as Mock).mockImplementation(function() {
        return {
          emails: { send: mockSend },
        };
      });

      const service = new ResendNotificationProviderService(container, {
        api_key: "key",
        from: "sender@example.com",
      });

      const result = await service.send({
        to: "user@example.com",
        channel: "email",
        template: Templates.WELCOME,
        data: { name: "John" },
      } as any);

      expect(result).toEqual({ id: "msg_123" });
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Welcome to Grace Stowel!",
        })
      );
    });

    it("handles Resend API errors", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        error: { message: "Invalid API key", statusCode: 401 },
      });
      (Resend as unknown as Mock).mockImplementation(function() {
        return {
          emails: { send: mockSend },
        };
      });

      const service = new ResendNotificationProviderService(container, {
        api_key: "key",
        from: "sender@example.com",
      });

      try {
        await service.send({
          to: "user@example.com",
          channel: "email",
          template: Templates.WELCOME,
          data: {},
        } as any);
      } catch (error: any) {
        expect(error.message).toBe("Invalid API key");
        expect(error.statusCode).toBe(401);
      }
      
      expect(logger.error).toHaveBeenCalled();
    });

    it("handles network errors", async () => {
      const mockSend = vi.fn().mockRejectedValue(new Error("Network Error"));
      (Resend as unknown as Mock).mockImplementation(function() {
        return {
          emails: { send: mockSend },
        };
      });

      const service = new ResendNotificationProviderService(container, {
        api_key: "key",
        from: "sender@example.com",
      });

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          template: Templates.WELCOME,
          data: {},
        } as any)
      ).rejects.toThrow("Network Error");
    });
  });
});
