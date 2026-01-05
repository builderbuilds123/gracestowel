import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260104_AddAllowBackorder extends Migration {

  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "inventory_level" ADD COLUMN IF NOT EXISTS "allow_backorder" boolean NOT NULL DEFAULT false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "inventory_level" DROP COLUMN IF EXISTS "allow_backorder";`);
  }

}
