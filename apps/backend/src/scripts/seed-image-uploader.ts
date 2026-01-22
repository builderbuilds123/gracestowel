/**
 * Helper module for uploading product images to S3/R2 or using local paths
 * Supports both Railway staging (S3) and local development (local files)
 */

import * as fs from "fs";
import * as path from "path";

export interface ImageUploadResult {
  url: string;
  success: boolean;
  error?: string;
}

/**
 * Upload a single image file to S3/R2 or return local path
 * @param filename - The image filename (e.g., "nuzzle-cloud-white-01.png")
 * @param fileService - Medusa file service (null for local dev)
 * @param logger - Logger instance
 */
export async function uploadProductImage(
  filename: string,
  fileService: any | null,
  logger: any
): Promise<ImageUploadResult> {
  // If no file service (local dev), return local path
  if (!fileService) {
    return {
      url: `/uploads/${filename}`,
      success: true,
    };
  }

  // Upload to S3/R2
  try {
    // Read file from local uploads directory
    const fullPath = path.resolve(process.cwd(), "uploads", filename);
    
    if (!fs.existsSync(fullPath)) {
      logger.warn(`Image file not found, using local path fallback: ${filename} (path: ${fullPath})`);
      return {
        url: `/uploads/${filename}`, // Fallback to local path
        success: false,
        error: "File not found",
      };
    }

    const fileBuffer = fs.readFileSync(fullPath);
    const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

    // Upload to S3/R2 using Medusa file service
    // The file service expects base64-encoded content
    // Use createFiles (plural) as per Medusa v2 API
    const result = await fileService.createFiles({
      filename,
      mimeType,
      content: fileBuffer.toString("base64"),
    });

    // The file service returns FileDTO with url property
    // For R2, this will be something like: https://r2.gracestowel.com/filename.png
    const fileDto = Array.isArray(result) ? result[0] : result;
    const uploadedUrl = fileDto?.url || fileDto?.file_key || `/uploads/${filename}`;
    
    logger.info(`Uploaded image to S3/R2: ${filename} -> ${uploadedUrl}`);
    
    return {
      url: uploadedUrl,
      success: true,
    };
  } catch (error) {
    logger.error(`Failed to upload image to S3/R2, using local path fallback: ${filename} - ${(error as Error).message}`);
    // Fallback to local path on error
    return {
      url: `/uploads/${filename}`,
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Upload multiple product images and return URLs
 * In Railway staging, uploads to S3/R2. In local dev, returns local paths.
 */
export async function uploadProductImages(
  imageFiles: string[],
  fileService: any | null,
  logger: any
): Promise<Array<{ url: string }>> {
  const results: Array<{ url: string }> = [];
  
  for (const filename of imageFiles) {
    const result = await uploadProductImage(filename, fileService, logger);
    results.push({ url: result.url });
    
    // Small delay to avoid rate limiting on S3/R2
    if (fileService) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}
