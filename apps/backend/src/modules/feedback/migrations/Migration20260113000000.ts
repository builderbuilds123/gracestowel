import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260113000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "feedback" (
        "id" TEXT NOT NULL,
        "feedback_type" TEXT CHECK ("feedback_type" IN ('csat', 'nps', 'ces', 'general')) NOT NULL DEFAULT 'csat',
        "score" INTEGER NOT NULL CHECK (
          ("feedback_type" = 'csat' AND "score" BETWEEN 1 AND 5) OR
          ("feedback_type" = 'nps' AND "score" BETWEEN 0 AND 10) OR
          ("feedback_type" = 'ces' AND "score" BETWEEN 1 AND 7) OR
          "feedback_type" = 'general'
        ),
        "comment" TEXT NULL,
        "trigger" TEXT CHECK ("trigger" IN ('floating_button', 'exit_intent', 'post_purchase', 'time_based', 'scroll_depth', 'manual')) NOT NULL DEFAULT 'floating_button',
        "page_url" TEXT NOT NULL,
        "page_route" TEXT NOT NULL,
        "page_title" TEXT NULL,
        "referrer" TEXT NULL,
        "product_id" TEXT NULL,
        "product_handle" TEXT NULL,
        "product_title" TEXT NULL,
        "selected_variant_id" TEXT NULL,
        "selected_options" JSONB NULL,
        "cart_item_count" INTEGER NOT NULL DEFAULT 0,
        "cart_total" INTEGER NOT NULL DEFAULT 0,
        "cart_items" JSONB NULL,
        "customer_id" TEXT NULL,
        "session_id" TEXT NOT NULL,
        "locale" TEXT NULL,
        "region" TEXT NULL,
        "context" JSONB NULL,
        "submitted_at" TIMESTAMPTZ NOT NULL,
        "status" TEXT CHECK ("status" IN ('new', 'reviewed', 'actioned', 'archived')) NOT NULL DEFAULT 'new',
        "reviewed_by" TEXT NULL,
        "reviewed_at" TIMESTAMPTZ NULL,
        "internal_notes" TEXT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
      );
    `)

    // Create indexes for common query patterns
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_deleted_at" ON "feedback" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_feedback_type" ON "feedback" ("feedback_type") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_score" ON "feedback" ("score") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_trigger" ON "feedback" ("trigger") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_customer_id" ON "feedback" ("customer_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_product_id" ON "feedback" ("product_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_page_route" ON "feedback" ("page_route") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_submitted_at" ON "feedback" ("submitted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_status" ON "feedback" ("status") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_feedback_session_id" ON "feedback" ("session_id") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "feedback" CASCADE;`)
  }
}
