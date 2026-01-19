export interface Product {
    id: number;
    handle: string;
    title: string;
    price: number;
    formattedPrice: string;
    description: string;
    images: string[];
    features: string[];
    dimensions: string;
    careInstructions: string[];
    colors: string[];
    disableEmbroidery?: boolean;
}

export const products: Record<string, Product> = {
    "the-nuzzle": {
        id: 1,
        handle: "the-nuzzle",
        title: "The Nuzzle",
        price: 18.00,
        formattedPrice: "$18.00",
        description: "Our signature washcloth. Gentle enough for a baby, durable enough for daily use. The Nuzzle is woven from 100% long-staple cotton for superior absorbency and softness.",
        images: [
            "/washcloth-nuzzle.jpg",
            "https://placehold.co/600x600/D4D8C4/3C3632?text=Texture+Detail",
            "https://placehold.co/600x600/FCFAF8/8A6E59?text=Folded+Stack"
        ],
        features: [
            "100% Long-Staple Cotton",
            "Perfect Face Cloth Size",
            "Oeko-Tex Certified",
            "Made in Portugal"
        ],
        dimensions: "13\" x 13\"",
        careInstructions: [
            "Machine wash warm",
            "Tumble dry low",
            "Do not bleach",
            "Avoid fabric softeners"
        ],
        colors: ["Cloud White", "Sage", "Terra Cotta"]
    },
    "the-cradle": {
        id: 2,
        handle: "the-cradle",
        title: "The Cradle",
        price: 25.00,
        formattedPrice: "$25.00",
        description: "The perfect hand towel. Soft, absorbent, and ready to comfort your hands after every wash. Designed to add a touch of luxury to your powder room.",
        images: [
            "/hand-towel-cradle.jpg",
            "https://placehold.co/600x600/D4D8C4/3C3632?text=Texture+Detail",
            "https://placehold.co/600x600/FCFAF8/8A6E59?text=Hanging+Loop"
        ],
        features: [
            "High Absorbency",
            "Quick Drying",
            "Double-Stitched Hems",
            "Sustainably Sourced"
        ],
        dimensions: "20\" x 30\"",
        careInstructions: [
            "Machine wash warm",
            "Tumble dry low",
            "Do not bleach",
            "Avoid fabric softeners"
        ],
        colors: ["Cloud White", "Charcoal", "Navy"]
    },
    "the-bear-hug": {
        id: 3,
        handle: "the-bear-hug",
        title: "The Bear Hug",
        price: 35.00,
        formattedPrice: "$35.00",
        description: "Wrap yourself in a warm embrace with our oversized, ultra-plush bath towel. The Bear Hug provides maximum coverage and maximum comfort for your post-bath ritual.",
        images: [
            "/bath-towel-bearhug.jpg",
            "/white_bathtowel_laidout_product.png",
            "/white_bathtowel_folded_product.png"
        ],
        features: [
            "Oversized for Comfort",
            "700 GSM Weight",
            "Cloud-like Softness",
            "Fade Resistant"
        ],
        dimensions: "30\" x 58\"",
        careInstructions: [
            "Machine wash warm",
            "Tumble dry low",
            "Do not bleach",
            "Avoid fabric softeners"
        ],
        colors: ["Cloud White", "Sand", "Stone"]
    },
    "the-wool-dryer-ball": {
        id: 4,
        handle: "the-wool-dryer-ball",
        title: "3 Wool Dryer Balls",
        price: 18.00,
        formattedPrice: "$18.00",
        description: "Reduce drying time and soften fabrics naturally. Comes with 3 balls. Our 100% New Zealand wool dryer balls are the eco-friendly alternative to dryer sheets.",
        images: [
            "/wood_dryer_balls.png",
            "/wood_dryer_balls.png"
        ],
        features: [
            "100% New Zealand Wool",
            "Reduces Drying Time",
            "Hypoallergenic",
            "Lasts for 1000+ Loads"
        ],
        dimensions: "3\" Diameter",
        careInstructions: [
            "Store in a dry place",
            "Recharge in sun monthly"
        ],
        colors: [],
        disableEmbroidery: true
    }
};

export const productList = Object.values(products);
