#!/bin/bash
# Generate optimized product images using placeholder service
# Creates properly sized, optimized images for all products and variants

UPLOADS_DIR="$(cd "$(dirname "$0")/../../uploads" && pwd)"
mkdir -p "$UPLOADS_DIR"

echo "Generating optimized product images..."
echo "Output directory: $UPLOADS_DIR"

# Function to download optimized image
download_image() {
    local product=$1
    local variant=$2
    local index=$3
    local width=$4
    local height=$5
    local color=$6
    local filename="${product}-${variant}-0${index}.png"
    local filepath="${UPLOADS_DIR}/${filename}"
    
    # Remove # from color for URL
    local color_clean=$(echo "$color" | tr -d '#')
    
    # Use placehold.co to generate optimized PNG images
    # Note: placehold.co returns SVG by default, so we need to use a different approach
    # Using via.placeholder.com which supports PNG format
    local url="https://via.placeholder.com/${width}x${height}/${color_clean}/FFFFFF.png?text=${product}+${variant}+${index}"
    
    # If via.placeholder fails, try placehold.co with explicit format
    if ! curl -s -f -o "$filepath" "$url"; then
        url="https://placehold.co/${width}x${height}/${color_clean}/FFFFFF.png?text=${product}+${variant}+${index}"
        curl -s -f -o "$filepath" "$url" || return 1
    fi
    
    # Verify it's actually a PNG (not SVG)
    if file "$filepath" | grep -q "SVG"; then
        # Convert SVG to PNG using ImageMagick if available, or use a fallback
        if command -v convert &> /dev/null; then
            convert "$filepath" "$filepath.tmp" && mv "$filepath.tmp" "$filepath"
        else
            # Fallback: use a simple base64 PNG placeholder
            echo "Warning: $filename is SVG, not PNG. Consider installing ImageMagick for conversion."
        fi
    fi
    
    if [ -f "$filepath" ]; then
        local size_kb=$(du -h "$filepath" | cut -f1)
        echo "✓ Generated: $filename ($size_kb)"
        return 0
    else
        echo "✗ Failed to generate $filename"
        return 1
    fi
}

# Product image configurations - 2 images per variant max
# The Nuzzle
download_image "nuzzle" "cloud-white" 1 800 800 "F5F5F0"
download_image "nuzzle" "cloud-white" 2 800 800 "F5F5F0"
download_image "nuzzle" "sage" 1 800 800 "9CAF88"
download_image "nuzzle" "sage" 2 800 800 "9CAF88"
download_image "nuzzle" "terra-cotta" 1 800 800 "C17A5F"
download_image "nuzzle" "terra-cotta" 2 800 800 "C17A5F"

# The Cradle
download_image "cradle" "cloud-white" 1 800 1000 "F5F5F0"
download_image "cradle" "cloud-white" 2 800 1000 "F5F5F0"
download_image "cradle" "charcoal" 1 800 1000 "36454F"
download_image "cradle" "charcoal" 2 800 1000 "36454F"
download_image "cradle" "navy" 1 800 1000 "001F3F"
download_image "cradle" "navy" 2 800 1000 "001F3F"

# The Bear Hug
download_image "bearhug" "cloud-white" 1 1000 1200 "F5F5F0"
download_image "bearhug" "cloud-white" 2 1000 1200 "F5F5F0"
download_image "bearhug" "sand" 1 1000 1200 "C2B280"
download_image "bearhug" "sand" 2 1000 1200 "C2B280"
download_image "bearhug" "stone" 1 1000 1200 "8B8680"
download_image "bearhug" "stone" 2 1000 1200 "8B8680"

# The Sandbar
download_image "sandbar" "sunset-orange" 1 1200 1500 "FF6B35"
download_image "sandbar" "sunset-orange" 2 1200 1500 "FF6B35"
download_image "sandbar" "ocean-blue" 1 1200 1500 "006994"
download_image "sandbar" "ocean-blue" 2 1200 1500 "006994"

# The Chef's Mate
download_image "chefs-mate" "checkered-red" 1 800 1000 "B22222"
download_image "chefs-mate" "checkered-red" 2 800 1000 "B22222"
download_image "chefs-mate" "classic-stripe" 1 800 1000 "2F4F4F"
download_image "chefs-mate" "classic-stripe" 2 800 1000 "2F4F4F"

# The Hearth
download_image "hearth" "walnut" 1 1000 1200 "5C4033"
download_image "hearth" "walnut" 2 1000 1200 "5C4033"
download_image "hearth" "slate" 1 1000 1200 "708090"
download_image "hearth" "slate" 2 1000 1200 "708090"

# Wool Dryer Balls
download_image "wool-dryer-balls" "natural" 1 800 800 "D4A574"

echo ""
echo "Image generation complete!"
echo "Total images: $(ls -1 "$UPLOADS_DIR"/*.png 2>/dev/null | wc -l | tr -d ' ')"
