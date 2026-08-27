import { VError } from "verror";
import { Client, DatabaseError, escapeIdentifier, escapeLiteral } from "pg";
import * as util from "util";

const isDatabaseError = (e: any): e is DatabaseError => {
  return typeof e.name === "string" && typeof e.length === "number";
};

/**
 * Postgres error code for a statement naming an object that does not exist,
 * such as a role that has already been dropped.
 */
const UNDEFINED_OBJECT_ERROR_CODE = "42704";

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

export const grantRoleMembership = async (props: {
  client: Client;
  role: string;
  member: string;
}) => {
  const { client, role, member } = props;

  await client.query(
    `GRANT ${escapeIdentifier(role)} TO ${escapeIdentifier(member)}`
  );
};

/**
 * Revoking tolerates a role that no longer exists, because a membership whose
 * role or member has already been dropped is in the wanted state. Postgres
 * raises an error for it, which would otherwise leave the custom resource in
 * DELETE_FAILED whenever the roles are dropped before the membership.
 */
export const revokeRoleMembership = async (props: {
  client: Client;
  role: string;
  member: string;
}) => {
  const { client, role, member } = props;

  try {
    await client.query(
      `REVOKE ${escapeIdentifier(role)} FROM ${escapeIdentifier(member)}`
    );
  } catch (thrown: unknown) {
    if (!util.types.isNativeError(thrown)) {
      throw thrown;
    }
    if (
      !isDatabaseError(thrown) ||
      thrown.code !== UNDEFINED_OBJECT_ERROR_CODE
    ) {
      throw new VError(thrown, "unexpected error while revoking role membership");
    }

    console.warn(thrown.message);
  }
};
