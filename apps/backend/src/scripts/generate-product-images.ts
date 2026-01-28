/**
 * Generate optimized product images for all products and variants
 * Creates properly sized, optimized images that meet Medusa requirements
 */

import * as fs from "fs";
import * as path from "path";
import { createCanvas } from "canvas";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface ProductImageConfig {
  product: string;
  variant: string;
  color: string;
  index: number;
  width: number;
  height: number;
}

// Product image configurations - 2-3 images per variant max
const imageConfigs: ProductImageConfig[] = [
  // The Nuzzle - Cloud White (2 images)
  { product: "nuzzle", variant: "cloud-white", color: "#F5F5F0", index: 1, width: 800, height: 800 },
  { product: "nuzzle", variant: "cloud-white", color: "#F5F5F0", index: 2, width: 800, height: 800 },
  
  // The Nuzzle - Sage (2 images)
  { product: "nuzzle", variant: "sage", color: "#9CAF88", index: 1, width: 800, height: 800 },
  { product: "nuzzle", variant: "sage", color: "#9CAF88", index: 2, width: 800, height: 800 },
  
  // The Nuzzle - Terra Cotta (2 images)
  { product: "nuzzle", variant: "terra-cotta", color: "#C17A5F", index: 1, width: 800, height: 800 },
  { product: "nuzzle", variant: "terra-cotta", color: "#C17A5F", index: 2, width: 800, height: 800 },
  
  // The Cradle - Cloud White (2 images)
  { product: "cradle", variant: "cloud-white", color: "#F5F5F0", index: 1, width: 800, height: 1000 },
  { product: "cradle", variant: "cloud-white", color: "#F5F5F0", index: 2, width: 800, height: 1000 },
  
  // The Cradle - Charcoal (2 images)
  { product: "cradle", variant: "charcoal", color: "#36454F", index: 1, width: 800, height: 1000 },
  { product: "cradle", variant: "charcoal", color: "#36454F", index: 2, width: 800, height: 1000 },
  
  // The Cradle - Navy (2 images)
  { product: "cradle", variant: "navy", color: "#001F3F", index: 1, width: 800, height: 1000 },
  { product: "cradle", variant: "navy", color: "#001F3F", index: 2, width: 800, height: 1000 },
  
  // The Bear Hug - Cloud White (2 images)
  { product: "bearhug", variant: "cloud-white", color: "#F5F5F0", index: 1, width: 1000, height: 1200 },
  { product: "bearhug", variant: "cloud-white", color: "#F5F5F0", index: 2, width: 1000, height: 1200 },
  
  // The Bear Hug - Sand (2 images)
  { product: "bearhug", variant: "sand", color: "#C2B280", index: 1, width: 1000, height: 1200 },
  { product: "bearhug", variant: "sand", color: "#C2B280", index: 2, width: 1000, height: 1200 },
  
  // The Bear Hug - Stone (2 images)
  { product: "bearhug", variant: "stone", color: "#8B8680", index: 1, width: 1000, height: 1200 },
  { product: "bearhug", variant: "stone", color: "#8B8680", index: 2, width: 1000, height: 1200 },
  
  // The Sandbar - Sunset Orange (2 images)
  { product: "sandbar", variant: "sunset-orange", color: "#FF6B35", index: 1, width: 1200, height: 1500 },
  { product: "sandbar", variant: "sunset-orange", color: "#FF6B35", index: 2, width: 1200, height: 1500 },
  
  // The Sandbar - Ocean Blue (2 images)
  { product: "sandbar", variant: "ocean-blue", color: "#006994", index: 1, width: 1200, height: 1500 },
  { product: "sandbar", variant: "ocean-blue", color: "#006994", index: 2, width: 1200, height: 1500 },
  
  // The Chef's Mate - Checkered Red (2 images)
  { product: "chefs-mate", variant: "checkered-red", color: "#B22222", index: 1, width: 800, height: 1000 },
  { product: "chefs-mate", variant: "checkered-red", color: "#B22222", index: 2, width: 800, height: 1000 },
  
  // The Chef's Mate - Classic Stripe (2 images)
  { product: "chefs-mate", variant: "classic-stripe", color: "#2F4F4F", index: 1, width: 800, height: 1000 },
  { product: "chefs-mate", variant: "classic-stripe", color: "#2F4F4F", index: 2, width: 800, height: 1000 },
  
  // The Hearth - Walnut (2 images)
  { product: "hearth", variant: "walnut", color: "#5C4033", index: 1, width: 1000, height: 1200 },
  { product: "hearth", variant: "walnut", color: "#5C4033", index: 2, width: 1000, height: 1200 },
  
  // The Hearth - Slate (2 images)
  { product: "hearth", variant: "slate", color: "#708090", index: 1, width: 1000, height: 1200 },
  { product: "hearth", variant: "slate", color: "#708090", index: 2, width: 1000, height: 1200 },
  
  // Wool Dryer Balls (1 image - single variant)
  { product: "wool-dryer-balls", variant: "natural", color: "#D4A574", index: 1, width: 800, height: 800 },
];

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [245, 245, 240]; // Default to cloud white
}

function generateImage(config: ProductImageConfig): Buffer {
  const canvas = createCanvas(config.width, config.height);
  const ctx = canvas.getContext("2d");
  
  // Background color
  const [r, g, b] = hexToRgb(config.color);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, config.width, config.height);
  
  // Add subtle texture pattern
  ctx.fillStyle = `rgba(255, 255, 255, 0.1)`;
  for (let i = 0; i < config.width; i += 20) {
    for (let j = 0; j < config.height; j += 20) {
      if ((i + j) % 40 === 0) {
        ctx.fillRect(i, j, 10, 10);
      }
    }
  }
  
  // Add product name and variant text
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const productName = config.product.charAt(0).toUpperCase() + config.product.slice(1).replace(/-/g, " ");
  const variantName = config.variant.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  ctx.fillText(productName, config.width / 2, config.height / 2 - 30);
  ctx.font = "36px Arial";
  ctx.fillText(variantName, config.width / 2, config.height / 2 + 30);
  ctx.font = "24px Arial";
  ctx.fillText(`Image ${config.index}`, config.width / 2, config.height / 2 + 80);
  
  // Return as PNG buffer
  return canvas.toBuffer("image/png");
}

async function generateAllImages() {
  console.log("Generating optimized product images...");
  console.log(`Output directory: ${UPLOADS_DIR}`);
  
  let generated = 0;
  let errors = 0;
  
  for (const config of imageConfigs) {
    try {
      const filename = `${config.product}-${config.variant}-0${config.index}.png`;
      const filepath = path.join(UPLOADS_DIR, filename);
      
      const imageBuffer = generateImage(config);
      fs.writeFileSync(filepath, imageBuffer);
      
      const stats = fs.statSync(filepath);
      console.log(`✓ Generated: ${filename} (${(stats.size / 1024).toFixed(1)}KB)`);
      generated++;
    } catch (error) {
      console.error(`✗ Failed to generate ${config.product}-${config.variant}-0${config.index}:`, error);
      errors++;
    }
  }
  
  console.log(`\nCompleted: ${generated} images generated, ${errors} errors`);
  return { generated, errors };
}

// Run if executed directly
if (require.main === module) {
  generateAllImages()
    .then(({ generated, errors }) => {
      process.exit(errors > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { generateAllImages, imageConfigs };
