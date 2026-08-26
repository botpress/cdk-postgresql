import { VError } from "verror";
import { Client, DatabaseError, escapeIdentifier, escapeLiteral } from "pg";
import * as util from "util";

const isDatabaseError = (e: any): e is DatabaseError => {
  return typeof e.name === "string" && typeof e.length === "number";
};

export const createRole = async (props: {
  client: Client;
  name: string;
  password: string;
}) => {
  const { client, name, password } = props;

  await client.query(
    `CREATE USER ${escapeIdentifier(name)} WITH PASSWORD ${escapeLiteral(password)}`
  );
};

export const createDatabase = async (props: {
  client: Client;
  name: string;
  owner: string;
}) => {
  const { client, name, owner } = props;

  const grantee = client.user;
  if (!grantee) {
    throw new VError("the connection has no user to grant the owner role to");
  }

  try {
    await client.query(
      `GRANT ${escapeIdentifier(owner)} TO ${escapeIdentifier(grantee)}`
    );
  } catch (e) {
    if (!util.types.isNativeError(e)) {
      throw e;
    }
    if (
      !isDatabaseError(e) ||
      !(
        e.code === "0LP01" &&
        e.message === `role "${owner}" is a member of role "${grantee}"`
      )
    ) {
      throw new VError(e, "unexpected error while creating grant");
    }

    console.warn(e.message);
  }

  return client.query(
    `CREATE DATABASE ${escapeIdentifier(name)} WITH OWNER ${escapeIdentifier(owner)}`
  );
};
