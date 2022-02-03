import { VError } from "verror";
import { Client, DatabaseError } from "pg";
import format from "pg-format";
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

  await client.query(format("CREATE USER %I WITH PASSWORD %L", name, password));
};

export const createDatabase = async (props: {
  client: Client;
  name: string;
  owner: string;
}) => {
  const { client, name, owner } = props;

  try {
    await client.query(format("GRANT %I TO %I", owner, client.user));
  } catch (e) {
    if (!util.types.isNativeError(e)) {
      throw e;
    }
    if (
      !isDatabaseError(e) ||
      !(
        e.code === "0LP01" &&
        e.message === `role "${owner}" is a member of role "${client.user}"`
      )
    ) {
      throw new VError(e, "unexpected error while creating grant");
    }

    console.warn(e.message);
  }

  return client.query(format("CREATE DATABASE %I WITH OWNER %I", name, owner));
};
