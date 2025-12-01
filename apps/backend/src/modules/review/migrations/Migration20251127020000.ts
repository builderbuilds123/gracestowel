import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251127020000 extends Migration {

  override async up(): Promise<void> {
    // Add order_id column for audit trail
    this.addSql(`ALTER TABLE "review" ADD COLUMN IF NOT EXISTS "order_id" text NULL;`);
    
    // Update customer_id and customer_email to be NOT NULL for new reviews
    // Note: We don't alter existing columns to NOT NULL as there may be existing data
    // The application logic will enforce required fields for new reviews
    
    // Add unique constraint on (customer_id, product_id) to prevent duplicate reviews
    // Using a partial unique index to allow NULL customer_id for legacy data
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_review_customer_product_unique" 
      ON "review" ("customer_id", "product_id") 
      WHERE "customer_id" IS NOT NULL AND "deleted_at" IS NULL;
    `);
    
    // Add index on order_id for lookup
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_review_order_id" ON "review" ("order_id") WHERE "deleted_at" IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_review_customer_product_unique";`);
    this.addSql(`DROP INDEX IF EXISTS "IDX_review_order_id";`);
    this.addSql(`ALTER TABLE "review" DROP COLUMN IF EXISTS "order_id";`);
  }

}

