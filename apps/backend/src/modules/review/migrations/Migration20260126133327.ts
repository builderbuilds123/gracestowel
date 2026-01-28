import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260126133327 extends Migration {
  override async up(): Promise<void> {
    // Add admin_response column to review table
    this.addSql(`ALTER TABLE "review" ADD COLUMN IF NOT EXISTS "admin_response" text NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "review" DROP COLUMN IF EXISTS "admin_response";`)
  }
}
