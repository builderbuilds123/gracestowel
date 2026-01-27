import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { REVIEW_MODULE } from "../modules/review";
import  ReviewModuleService from "../modules/review/service";
import { Modules } from "@medusajs/framework/utils";

export default async function createTestReviews({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  logger.info("Resolving services...");
  const reviewService = container.resolve<ReviewModuleService>(REVIEW_MODULE);
  const productModuleService = container.resolve(Modules.PRODUCT);

  logger.info("Starting to create test reviews...");

  // Get some products
  const products = await productModuleService.listProducts({}, { take: 5 });
  
  if (products.length === 0) {
    logger.error("No products found to review. Run seed first.");
    return;
  }

  const reviewsData = [
    {
      title: "Great Towel!",
      content: "This towel is super soft and drys quickly. Highly recommended.",
      rating: 5,
      customer_name: "Alice Johnson",
      verified_purchase: true,
      status: "approved" as const,
    },
    {
        title: "Disappointed",
        content: "The color faded after one wash. Not what I expected.",
        rating: 2,
        customer_name: "Bob Smith",
        verified_purchase: true,
        status: "pending" as const,
    }, 
     {
        title: "Just okay",
        content: "It does the job, but nothing special for the price.",
        rating: 3,
        customer_name: "Charlie Brown",
        verified_purchase: false,
        status: "pending" as const,
    }
  ];

  for (const product of products) {
    logger.info(`Adding reviews for product: ${product.title}`);
    
    for (const data of reviewsData) {
        try {
            await reviewService.createReviews({
                product_id: product.id,
                customer_id: "test-customer-" + Math.random().toString(36).substring(7),
                ...data
            });
            logger.info(`Created review "${data.title}" for ${product.title}`);
        } catch (e) {
            logger.error(`Failed to create review: ${(e as Error).message}`);
        }
    }
  }

  logger.info("Test reviews created successfully.");
}
