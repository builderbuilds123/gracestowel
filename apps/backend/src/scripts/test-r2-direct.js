require('dotenv').config(); // Try standard dotenv first
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');
const path = require('path');

// Manually load .env if dotenv missing (fallback)
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envConfig = fs.readFileSync(envPath, 'utf8');
      envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) {
             process.env[key] = value;
          }
        }
      });
    }
  } catch (e) {
    console.error("Error loading .env:", e);
  }
}

loadEnv();

async function testR2() {
  console.log("Testing R2 Connection Direct...");
  console.log("ENDPOINT:", process.env.S3_ENDPOINT || "MISSING");
  console.log("PUBLIC_URL:", process.env.S3_PUBLIC_URL || "MISSING");
  console.log("Bucket:", process.env.S3_BUCKET || "MISSING");
  console.log("Region:", process.env.S3_REGION || "MISSING");

  if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
      console.error("ERROR: Missing S3_ENDPOINT or Credentials in environment");
      return;
  }

  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // CRITICAL FOR R2
  });

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: "test-direct-upload.txt",
      Body: "Direct AWS SDK upload test",
      ContentType: "text/plain",
    });

    console.log("Sending PutObjectCommand...");
    const response = await client.send(command);
    console.log("SUCCESS! File uploaded.");
    console.log("ETag:", response.ETag);
    console.log(`Public URL: ${process.env.S3_PUBLIC_URL}/test-direct-upload.txt`);
    console.log(`(Uploaded via endpoint: ${process.env.S3_ENDPOINT})`);
  } catch (error) {
    console.error("\n--- UPLOAD FAILED ---");
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    if (error.$metadata) console.error("Metadata:", error.$metadata);
  }
}

testR2();
