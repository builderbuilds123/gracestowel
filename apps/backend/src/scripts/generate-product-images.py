#!/usr/bin/env python3
"""
Generate optimized product images for all products and variants.
Creates properly sized, optimized PNG images that meet Medusa requirements.
"""

import os
from PIL import Image, ImageDraw, ImageFont
import sys

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

# Ensure uploads directory exists
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Product image configurations - 2 images per variant max (Medusa best practice)
IMAGE_CONFIGS = [
    # The Nuzzle - Cloud White (2 images)
    {"product": "nuzzle", "variant": "cloud-white", "color": "#F5F5F0", "index": 1, "width": 800, "height": 800},
    {"product": "nuzzle", "variant": "cloud-white", "color": "#F5F5F0", "index": 2, "width": 800, "height": 800},
    
    # The Nuzzle - Sage (2 images)
    {"product": "nuzzle", "variant": "sage", "color": "#9CAF88", "index": 1, "width": 800, "height": 800},
    {"product": "nuzzle", "variant": "sage", "color": "#9CAF88", "index": 2, "width": 800, "height": 800},
    
    # The Nuzzle - Terra Cotta (2 images)
    {"product": "nuzzle", "variant": "terra-cotta", "color": "#C17A5F", "index": 1, "width": 800, "height": 800},
    {"product": "nuzzle", "variant": "terra-cotta", "color": "#C17A5F", "index": 2, "width": 800, "height": 800},
    
    # The Cradle - Cloud White (2 images)
    {"product": "cradle", "variant": "cloud-white", "color": "#F5F5F0", "index": 1, "width": 800, "height": 1000},
    {"product": "cradle", "variant": "cloud-white", "color": "#F5F5F0", "index": 2, "width": 800, "height": 1000},
    
    # The Cradle - Charcoal (2 images)
    {"product": "cradle", "variant": "charcoal", "color": "#36454F", "index": 1, "width": 800, "height": 1000},
    {"product": "cradle", "variant": "charcoal", "color": "#36454F", "index": 2, "width": 800, "height": 1000},
    
    # The Cradle - Navy (2 images)
    {"product": "cradle", "variant": "navy", "color": "#001F3F", "index": 1, "width": 800, "height": 1000},
    {"product": "cradle", "variant": "navy", "color": "#001F3F", "index": 2, "width": 800, "height": 1000},
    
    # The Bear Hug - Cloud White (2 images)
    {"product": "bearhug", "variant": "cloud-white", "color": "#F5F5F0", "index": 1, "width": 1000, "height": 1200},
    {"product": "bearhug", "variant": "cloud-white", "color": "#F5F5F0", "index": 2, "width": 1000, "height": 1200},
    
    # The Bear Hug - Sand (2 images)
    {"product": "bearhug", "variant": "sand", "color": "#C2B280", "index": 1, "width": 1000, "height": 1200},
    {"product": "bearhug", "variant": "sand", "color": "#C2B280", "index": 2, "width": 1000, "height": 1200},
    
    # The Bear Hug - Stone (2 images)
    {"product": "bearhug", "variant": "stone", "color": "#8B8680", "index": 1, "width": 1000, "height": 1200},
    {"product": "bearhug", "variant": "stone", "color": "#8B8680", "index": 2, "width": 1000, "height": 1200},
    
    # The Sandbar - Sunset Orange (2 images)
    {"product": "sandbar", "variant": "sunset-orange", "color": "#FF6B35", "index": 1, "width": 1200, "height": 1500},
    {"product": "sandbar", "variant": "sunset-orange", "color": "#FF6B35", "index": 2, "width": 1200, "height": 1500},
    
    # The Sandbar - Ocean Blue (2 images)
    {"product": "sandbar", "variant": "ocean-blue", "color": "#006994", "index": 1, "width": 1200, "height": 1500},
    {"product": "sandbar", "variant": "ocean-blue", "color": "#006994", "index": 2, "width": 1200, "height": 1500},
    
    # The Chef's Mate - Checkered Red (2 images)
    {"product": "chefs-mate", "variant": "checkered-red", "color": "#B22222", "index": 1, "width": 800, "height": 1000},
    {"product": "chefs-mate", "variant": "checkered-red", "color": "#B22222", "index": 2, "width": 800, "height": 1000},
    
    # The Chef's Mate - Classic Stripe (2 images)
    {"product": "chefs-mate", "variant": "classic-stripe", "color": "#2F4F4F", "index": 1, "width": 800, "height": 1000},
    {"product": "chefs-mate", "variant": "classic-stripe", "color": "#2F4F4F", "index": 2, "width": 800, "height": 1000},
    
    # The Hearth - Walnut (2 images)
    {"product": "hearth", "variant": "walnut", "color": "#5C4033", "index": 1, "width": 1000, "height": 1200},
    {"product": "hearth", "variant": "walnut", "color": "#5C4033", "index": 2, "width": 1000, "height": 1200},
    
    # The Hearth - Slate (2 images)
    {"product": "hearth", "variant": "slate", "color": "#708090", "index": 1, "width": 1000, "height": 1200},
    {"product": "hearth", "variant": "slate", "color": "#708090", "index": 2, "width": 1000, "height": 1200},
    
    # Wool Dryer Balls (1 image - single variant)
    {"product": "wool-dryer-balls", "variant": "natural", "color": "#D4A574", "index": 1, "width": 800, "height": 800},
]

def hex_to_rgb(hex_color):
    """Convert hex color to RGB tuple"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def generate_image(config):
    """Generate a single optimized product image"""
    width = config["width"]
    height = config["height"]
    color = config["color"]
    
    # Create image with background color
    rgb = hex_to_rgb(color)
    img = Image.new("RGB", (width, height), rgb)
    draw = ImageDraw.Draw(img)
    
    # Add subtle texture pattern
    overlay = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for i in range(0, width, 20):
        for j in range(0, height, 20):
            if (i + j) % 40 == 0:
                overlay_draw.rectangle([i, j, i+10, j+10], fill=(255, 255, 255, 25))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)
    
    # Add product name and variant text
    try:
        # Try to use a nice font, fallback to default
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 48)
        font_medium = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
    except:
        try:
            font_large = ImageFont.load_default()
            font_medium = ImageFont.load_default()
            font_small = ImageFont.load_default()
        except:
            font_large = font_medium = font_small = None
    
    text_color = (0, 0, 0, 76)  # 30% opacity black
    product_name = config["product"].replace("-", " ").title()
    variant_name = config["variant"].replace("-", " ").title()
    
    # Draw text
    if font_large:
        bbox = draw.textbbox((0, 0), product_name, font=font_large)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width) // 2, height // 2 - 60), product_name, fill=text_color, font=font_large)
        
        bbox = draw.textbbox((0, 0), variant_name, font=font_medium)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width) // 2, height // 2), variant_name, fill=text_color, font=font_medium)
        
        bbox = draw.textbbox((0, 0), f"Image {config['index']}", font=font_small)
        text_width = bbox[2] - bbox[0]
        draw.text(((width - text_width) // 2, height // 2 + 60), f"Image {config['index']}", fill=text_color, font=font_small)
    else:
        draw.text((width // 2, height // 2 - 30), product_name, fill=text_color, anchor="mm")
        draw.text((width // 2, height // 2), variant_name, fill=text_color, anchor="mm")
        draw.text((width // 2, height // 2 + 30), f"Image {config['index']}", fill=text_color, anchor="mm")
    
    return img

def main():
    print(f"Generating optimized product images...")
    print(f"Output directory: {UPLOADS_DIR}")
    
    generated = 0
    errors = 0
    
    for config in IMAGE_CONFIGS:
        try:
            filename = f"{config['product']}-{config['variant']}-0{config['index']}.png"
            filepath = os.path.join(UPLOADS_DIR, filename)
            
            img = generate_image(config)
            # Save as optimized PNG
            img.save(filepath, "PNG", optimize=True, compress_level=9)
            
            size_kb = os.path.getsize(filepath) / 1024
            print(f"✓ Generated: {filename} ({size_kb:.1f}KB)")
            generated += 1
        except Exception as e:
            print(f"✗ Failed to generate {config['product']}-{config['variant']}-0{config['index']}: {e}")
            errors += 1
    
    print(f"\nCompleted: {generated} images generated, {errors} errors")
    return 0 if errors == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
