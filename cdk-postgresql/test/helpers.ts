import { Client } from "pg";

const getRoles = async (client: Client) => {
  const { rows } = await client.query("SELECT rolname FROM pg_roles");
  return rows.map((r) => r.rolname);
};

export const roleExists = async (
  client: Client,
  role: string
): Promise<boolean> => {
  const roles = await getRoles(client);
  return roles.find((r) => r === role) !== undefined;
};

const getDatabases = async (client: Client) => {
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
  return databases.find((d) => d === db) !== undefined;
};
