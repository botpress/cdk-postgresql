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
