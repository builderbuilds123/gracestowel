import path from "path";
import fs from "fs";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { logger } from "../../../utils/logger";

const UPLOADS_DIR = "uploads";
const COMPONENT = "uploads";

/**
 * GET /uploads/:filename
 *
 * Serves local product image files from apps/backend/uploads.
 * Used when @medusajs/file-local is configured (e.g. local dev, no S3).
 * Seed stores image URLs as /uploads/...; frontend rewrites to backend + /uploads/...
 */
export async function OPTIONS(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  // Handle preflight CORS requests
  const origin = req.headers.origin;
  const allowedOrigins = process.env.STORE_CORS?.split(",").map(o => o.trim()) || [];
  if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes("*"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  res.status(204).end();
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { filename } = req.params as { filename: string };

  if (!filename || typeof filename !== "string") {
    logger.warn(COMPONENT, "Uploads GET missing filename", {
      path: req.path,
      params: req.params,
    });
    res.status(400).json({
      error: "Missing filename",
      code: "MISSING_FILENAME",
    });
    return;
  }

  // Prevent path traversal: only allow safe filenames (no .., no absolute paths)
  if (filename.includes("..") || path.isAbsolute(filename)) {
    logger.warn(COMPONENT, "Uploads GET path traversal attempt rejected", {
      filename,
      path: req.path,
    });
    res.status(400).json({
      error: "Invalid filename",
      code: "INVALID_FILENAME",
    });
    return;
  }

  const uploadsRoot = path.resolve(process.cwd(), UPLOADS_DIR);
  const filePath = path.join(uploadsRoot, filename);

  // Ensure resolved path is still under uploads dir
  const relative = path.relative(uploadsRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    logger.warn(COMPONENT, "Uploads GET path escape rejected", {
      filename,
      resolved: filePath,
    });
    res.status(400).json({
      error: "Invalid filename",
      code: "INVALID_FILENAME",
    });
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    logger.info(COMPONENT, "Uploads GET file not found", {
      filename,
      uploadsRoot,
    });
    res.status(404).json({
      error: "File not found",
      code: "NOT_FOUND",
    });
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  const mime: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  const contentType = mime[ext] || "application/octet-stream";

  // CORS headers for cross-origin image requests from frontend
  // Always allow localhost in development, check STORE_CORS for production
  const origin = req.headers.origin;
  const allowedOrigins = process.env.STORE_CORS?.split(",").map(o => o.trim()) || [];
  const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("https://localhost:");
  const isAllowed = origin && (allowedOrigins.includes(origin) || allowedOrigins.includes("*") || isLocalhost);
  
  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
  }

  // Read file as buffer and send it (Medusa v2 recommended approach for binary files)
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);
    
    // Set headers before sending
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.setHeader("Content-Length", fileStats.size.toString());
    
    // Send buffer directly - Express/Medusa handles binary encoding
    res.send(fileBuffer);
  } catch (err) {
    logger.error(COMPONENT, "Uploads GET readFile failed", { filename, path: req.path }, err as Error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to serve file",
        code: "READ_ERROR",
      });
    }
  }
}
