"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSharedConnectionSymbol = void 0;
exports.createPgConnection = createPgConnection;
const postgresql_1 = require("@medusajs/deps/mikro-orm/postgresql");
/**
 * Create a new knex (pg in the future) connection which can be reused and shared
 * @param options
 */
function createPgConnection(options) {
    const { pool, schema = "public", clientUrl, driverOptions } = options;
    const ssl = options.driverOptions?.ssl ??
        options.driverOptions?.connection?.ssl ??
        false;
    const connectionTimeoutMillis = driverOptions?.connectionTimeoutMillis ??
        driverOptions?.connection?.connectionTimeoutMillis ??
        5000;
    const keepAliveInitialDelayMillis = driverOptions?.keepAliveInitialDelayMillis ??
        driverOptions?.connection?.keepAliveInitialDelayMillis ??
        10000;
    const keepAlive = driverOptions?.keepAlive ?? driverOptions?.connection?.keepAlive ?? true;
    return (0, postgresql_1.knex)({
        client: "pg",
        searchPath: schema,
        connection: {
            connectionString: clientUrl,
            ssl: ssl,
            idle_in_transaction_session_timeout: driverOptions?.idle_in_transaction_session_timeout ??
                undefined, // prevent null to be passed
            connectionTimeoutMillis: connectionTimeoutMillis, // Fail fast on slow connects
            keepAlive: keepAlive, // Prevent connections from being dropped
            keepAliveInitialDelayMillis: keepAliveInitialDelayMillis, // Start keepalive probes after 10s
        },
        pool: {
            propagateCreateError: false, // Don't fail entire pool on one bad connection
            min: pool?.min ?? 1,
            // https://knexjs.org/guide/#pool
            ...(pool ?? {}),
        },
    });
}
exports.isSharedConnectionSymbol = Symbol.for("isSharedConnection");
//# sourceMappingURL=create-pg-connection.js.map