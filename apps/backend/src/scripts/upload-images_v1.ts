import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import * as path from "path";
import * as fs from "fs";

export default async function({ container }: ExecArgs) {
  console.log("Starting upload script...");
  
  // No need to initialize, container is provided


  console.log("Resolving File Service...");
  
  // Try to resolve the File Module
  let fileService;
  try {
      fileService = container.resolve(Modules.FILE);
  } catch (e) {
      console.log("Could not resolve via Modules.FILE, trying 'file'...");
      try {
        fileService = container.resolve("file");
      } catch (e2) {
          console.error("Failed to resolve file service:", e2);
          process.exit(1);
      }
  }



  const uploadDir = path.resolve(process.cwd(), "uploads_staging");
  if (!fs.existsSync(uploadDir)) {
      console.error(`Upload directory not found: ${uploadDir}`);
      process.exit(1);
  }

  const files = fs.readdirSync(uploadDir);
  console.log(`Found ${files.length} files to upload.`);

  const processedUrls: string[] = [];

  for (const file of files) {
      if (file === ".DS_Store") continue;
      
      const filePath = path.join(uploadDir, file);
      const fileContent = fs.readFileSync(filePath);
      const mimeType = file.endsWith(".png") ? "image/png" : "image/jpeg";
      
      console.log(`Uploading ${file}...`);
      
      try {
         // In Medusa v2, the method is usually 'createFiles'
         const result = await fileService.createFiles({
             filename: file,
             mimeType: mimeType,
             content: fileContent.toString("binary"), // Pass as binary string or Buffer if supported
         });
         
         const uploadedFile = Array.isArray(result) ? result[0] : result;
         console.log(`Uploaded successful: ${uploadedFile.url}`);
         processedUrls.push(uploadedFile.url);
         
      } catch (err) {
          console.error(`Failed to upload ${file}:`, err);
          // Retry with raw buffer
          try {
             const result = await fileService.createFiles({
                 filename: file,
                 mimeType: mimeType,
                 content: fileContent,
             });
             const uploadedFile = Array.isArray(result) ? result[0] : result;
             console.log(`Uploaded (retry) successful: ${uploadedFile.url}`);
             processedUrls.push(uploadedFile.url);
          } catch (err2) {
             console.error(`Failed retry with buffer:`, err2);
          }
      }
  }
  
  console.log("Done.");
  console.log("Uploaded URLs:", processedUrls);
}

