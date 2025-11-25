import { MikroORM } from "@medusajs/deps/mikro-orm/core";
import { Migrator as BaseMigrator, UmzugMigration } from "@medusajs/deps/mikro-orm/migrations";
export declare class CustomDBMigrator extends BaseMigrator {
    static register(orm: MikroORM): void;
    resolve(params: any): any;
    getPendingMigrations(): Promise<UmzugMigration[]>;
}
//# sourceMappingURL=custom-db-migrator.d.ts.map