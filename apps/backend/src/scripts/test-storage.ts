import {
  ExecArgs,
  IFileModuleService,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

export default async function ({ container }: ExecArgs) {
  const fileService: IFileModuleService = container.resolve(Modules.FILE)

  console.log("Resolving File Service...")
  
  if (!fileService) {
    console.error("ERROR: File Service not found in container.")
    return
  }
  
  console.log("File Service found. Attempting upload...")

  try {
    const fileContent = Buffer.from("Test file content for R2 verification")
    // Use base64 string for content as per Medusa File Module contract
    const result = await fileService.create({
      filename: "test-r2-upload.txt",
      mimeType: "text/plain",
      content: fileContent.toString("base64"),
      access: "public"
    })

    console.log("Upload successful!")
    console.log("Result:", JSON.stringify(result, null, 2))
  } catch (error: any) {
    console.log("\n--- UPLOAD FAILED ---")
    console.error("Error details:", error)
    if (error.code) console.error("Error Code:", error.code)
    if (error.$metadata) console.error("AWS Metadata:", error.$metadata)
    // Log stack trace if available
    if (error.stack) console.error("Stack:", error.stack)
  }
}
