import { GenericContainer, Wait } from "testcontainers";
import { Client } from "pg";

export const DB_MASTER_USERNAME = "postgres";
export const DB_MASTER_PASSWORD = "masterpwd";
export const DB_DEFAULT_DB = "postgres";

const DB_PORT = 5432;

export type PostgresCluster = {
  host: string;
  port: number;
  connectTo: (database: string) => Promise<Client>;
  /**
   * Returns the cluster to a blank state by dropping every replication slot,
   * extra database, publication, table, and role a test created.
   */
  reset: () => Promise<void>;
  stop: () => Promise<void>;
};

export const startPostgresCluster = async (): Promise<PostgresCluster> => {
  const container = await new GenericContainer("postgres:16")
    .withExposedPorts(DB_PORT)
    .withEnvironment({ POSTGRES_PASSWORD: DB_MASTER_PASSWORD })
    // Logical replication slots require logical write-ahead-log decoding.
    // Durability is off because the data is throwaway:
    .withCommand([
      "postgres",
      "-c",
      "wal_level=logical",
      "-c",
      "fsync=off",
      "-c",
      "synchronous_commit=off",
      "-c",
      "full_page_writes=off",
    ])
    // The image's setup script starts and stops the server once before the
    // final start, so connections are only reliable after the second
    // "ready" line:
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2)
    )
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(DB_PORT);

  const connectTo = async (database: string) => {
    const client = new Client({
      host,
      port,
      database,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await client.connect();
    return client;
  };

  const resetClient = await connectTo(DB_DEFAULT_DB);

  const reset = async () => {
    const { rows: slots } = await resetClient.query(
      "SELECT slot_name, database FROM pg_replication_slots"
    );
    for (const { slot_name, database } of slots) {
      if (database && database !== DB_DEFAULT_DB) {
        // A logical slot can only be dropped from the database it decodes:
        const client = await connectTo(database);
        await client.query("SELECT pg_drop_replication_slot($1)", [slot_name]);
        await client.end();
      } else {
        await resetClient.query("SELECT pg_drop_replication_slot($1)", [slot_name]);
      }
    }

    const { rows: databases } = await resetClient.query(
      "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> current_database()"
    );
    for (const { datname } of databases) {
      await resetClient.query(`DROP DATABASE "${datname}" WITH (FORCE)`);
    }

    const { rows: publications } = await resetClient.query(
      "SELECT pubname FROM pg_publication"
    );
    for (const { pubname } of publications) {
      await resetClient.query(`DROP PUBLICATION "${pubname}"`);
    }

    const { rows: tables } = await resetClient.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    for (const { tablename } of tables) {
      await resetClient.query(`DROP TABLE "${tablename}" CASCADE`);
    }

    const { rows: roles } = await resetClient.query(
      "SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' AND rolname <> current_user"
    );
    for (const { rolname } of roles) {
      await resetClient.query(`DROP OWNED BY "${rolname}"`);
      await resetClient.query(`DROP ROLE "${rolname}"`);
    }
  };

  const stop = async () => {
    await resetClient.end();
    await container.stop();
  };

  return { host, port, connectTo, reset, stop };
};
