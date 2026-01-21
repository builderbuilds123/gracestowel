import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260121_DropFeedbackTable extends Migration {
  override async up(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "feedback" CASCADE;`);
  }

  override async down(): Promise<void> {
    // Irreversible migration by request: feedback data is intentionally dropped.
  }
}
