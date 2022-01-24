import { Client } from "pg";

export const getRoles = async (client: Client) => {
  const { rows } = await client.query("SELECT rolname FROM pg_roles");
  return rows.map((r) => r.rolname);
};

export const getDatabases = async (client: Client) => {
  const { rows } = await client.query(
    "SELECT datname FROM pg_database WHERE datistemplate = false"
  );
  return rows.map((r) => r.datname);
};

export const dbExists = async (
  client: Client,
  db: string
): Promise<boolean> => {
  const databases = await getDatabases(client);
  console.log(`got databases: ${databases}`);
  return databases.find((d) => d === db) !== undefined;
};
