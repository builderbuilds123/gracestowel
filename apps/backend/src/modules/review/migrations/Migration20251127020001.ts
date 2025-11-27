import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251127020001 extends Migration {

  override async up(): Promise<void> {
    // Create review_helpful_vote table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "review_helpful_vote" (
        "id" text NOT NULL,
        "review_id" text NOT NULL,
        "voter_identifier" text NOT NULL,
        "voter_type" text CHECK ("voter_type" IN ('customer', 'anonymous')) NOT NULL DEFAULT 'anonymous',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "review_helpful_vote_pkey" PRIMARY KEY ("id")
      );
    `);
    
    // Add indexes
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_review_helpful_vote_deleted_at" ON "review_helpful_vote" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_review_helpful_vote_review_id" ON "review_helpful_vote" ("review_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_review_helpful_vote_voter" ON "review_helpful_vote" ("voter_identifier") WHERE deleted_at IS NULL;`);
    
    // Unique constraint to prevent duplicate votes
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_review_helpful_vote_unique" 
      ON "review_helpful_vote" ("review_id", "voter_identifier") 
      WHERE "deleted_at" IS NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "review_helpful_vote" CASCADE;`);
  }

}

