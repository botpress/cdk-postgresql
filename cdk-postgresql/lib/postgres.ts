import { Client } from "pg";
import format from "pg-format";

export const createRole = async (props: {
  client: Client;
  name: string;
  password: string;
}) => {
  const { client, name, password } = props;

  await client.query(format("CREATE USER %I WITH PASSWORD %L", name, password));
};

export const createDatabase = async (props: {
  client: Client;
  name: string;
  owner: string;
}) => {
  const { client, name, owner } = props;

  await client.query(format("GRANT %I TO %I", owner, client.user));
  return client.query(format("CREATE DATABASE %I WITH OWNER %I", name, owner));
};
