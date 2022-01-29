import format from "pg-format";

import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from "aws-lambda/trigger/cloudformation-custom-resource";

import {
  validateConnection,
  hashCode,
  createClient,
  secretsmanager,
} from "./util";
import { Connection } from "./lambda.types";
import * as postgres from "./postgres";

interface Props {
  ServiceToken: string;
  Connection: Connection;
  Name: string;
  PasswordArn: string;
}

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  switch (event.RequestType) {
    case "Create":
      return handleCreate(event);
    case "Update":
      return handleUpdate(event);
    case "Delete":
      return handleDelete(event);
  }
};

const handleCreate = async (event: CloudFormationCustomResourceCreateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await createRole({
    connection: props.Connection,
    name: props.Name,
    passwordArn: props.PasswordArn,
  });
  return {
    PhysicalResourceId: generatePhysicalId(props),
  };
};

const handleUpdate = async (event: CloudFormationCustomResourceUpdateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);

  const oldProps = event.OldResourceProperties as Props;

  const oldPhysicalResourceId = generatePhysicalId(oldProps);
  const physicalResourceId = generatePhysicalId(props);

  if (physicalResourceId != oldPhysicalResourceId) {
    await createRole({
      connection: props.Connection,
      name: props.Name,
      passwordArn: props.PasswordArn,
    });
    return { PhysicalResourceId: physicalResourceId };
  }

  if (props.Name != oldProps.Name) {
    await updateRoleName(props.Connection, oldProps.Name, props.Name);
  }

  if (props.PasswordArn != oldProps.PasswordArn) {
    await updateRolePassword({
      connection: props.Connection,
      name: props.Name,
      passwordArn: props.PasswordArn,
    });
  }

  return { PhysicalResourceId: physicalResourceId };
};

const handleDelete = async (event: CloudFormationCustomResourceDeleteEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await deleteRole(props.Connection, props.Name);
  return {};
};

const validateProps = (props: Props) => {
  if (!("Connection" in props)) {
    throw "Connection property is required";
  }
  validateConnection(props.Connection);

  if (!("Name" in props)) {
    throw "Name property is required";
  }
  if (!("PasswordArn" in props)) {
    throw "PasswordArn property is required";
  }
};

const generatePhysicalId = (props: Props): string => {
  const { Host, Port } = props.Connection;
  const suffix = Math.abs(hashCode(`${Host}-${Port}`));
  return `role-${suffix}`;
};

export const deleteRole = async (connection: Connection, name: string) => {
  console.log("Deleting user", name);
  const client = await createClient(connection);
  await client.connect();

  await client.query(format("DROP USER %I", name));
  await client.end();
};

export const updateRoleName = async (
  connection: Connection,
  oldName: string,
  newName: string
) => {
  console.log(`Updating role name from ${oldName} to ${newName}`);
  const client = await createClient(connection);
  await client.connect();

  await client.query(format("ALTER ROLE %I RENAME TO %I", oldName, newName));
  await client.end();
};

export const updateRolePassword = async (props: {
  connection: Connection;
  name: string;
  passwordArn: string;
}) => {
  const { connection, name, passwordArn } = props;
  console.log("Updating user password", name);

  const client = await createClient(connection);
  await client.connect();

  const { SecretString: password } = await secretsmanager.getSecretValue({
    SecretId: passwordArn,
  });

  await client.query(format("ALTER USER %I WITH PASSWORD %L", name, password));
  await client.end();
};

export const createRole = async (props: {
  connection: Connection;
  name: string;
  passwordArn: string;
}) => {
  const { connection, name, passwordArn } = props;
  console.log("Creating user", name);
  const client = await createClient(connection);
  await client.connect();

  const { SecretString: password } = await secretsmanager.getSecretValue({
    SecretId: passwordArn,
  });
  if (!password) {
    throw new Error("could not decrypt password");
  }

  await postgres.createRole({ client, name, password });

  await client.end();
};
