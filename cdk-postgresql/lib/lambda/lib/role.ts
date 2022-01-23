import format from "pg-format";

import { SecretsManager } from "@aws-sdk/client-secrets-manager";

const secretsmanager = new SecretsManager({});

import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from "aws-lambda/trigger/cloudformation-custom-resource";

import { validateConnection, Connection, hashCode, createClient } from "./util";

interface Props {
  ServiceToken: string;
  connection: Connection;
  Name: string;
  PasswordArn: string;
}

export const roleHandler = async (event: CloudFormationCustomResourceEvent) => {
  switch (event.RequestType) {
    case "Create":
      return await handleCreate(event);
    case "Update":
      return await handleUpdate(event);
    case "Delete":
      return await handleDelete(event);
  }
};

const handleCreate = async (event: CloudFormationCustomResourceCreateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await createRole({
    connection: props.connection,
    name: props.Name,
    passwordArn: props.PasswordArn,
  });
  return { PhysicalResourceId: generatePhysicalId(props) };
};

const handleUpdate = async (event: CloudFormationCustomResourceUpdateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);

  const oldProps = event.OldResourceProperties as Props;

  const oldPhysicalResourceId = generatePhysicalId(oldProps);
  const physicalResourceId = generatePhysicalId(props);

  if (physicalResourceId != oldPhysicalResourceId) {
    await createRole({connection: props.connection, name: props.Name, passwordArn: props.PasswordArn);
    return { PhysicalResourceId: physicalResourceId };
  }

  if (props.Name != oldProps.Name) {
    await updateRoleName(props.connection, oldProps.Name, props.Name);
  }

  if (props.PasswordArn != oldProps.PasswordArn) {
    await updateRolePassword({
      connection: props.connection,
      name: props.Name,
      passwordArn: props.PasswordArn,
    });
  }

  return { PhysicalResourceId: physicalResourceId };
};

const handleDelete = async (event: CloudFormationCustomResourceDeleteEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await deleteRole(props.connection, props.Name);
  return {};
};

const validateProps = (props: Props) => {
  if (!("connection" in props)) {
    throw "connection property is required";
  }
  validateConnection(props.connection);

  if (!("Name" in props)) {
    throw "Name property is required";
  }
  if (!("PasswordArn" in props)) {
    throw "PasswordArn property is required";
  }
};

const generatePhysicalId = (props: Props): string => {
  const { Host, Port } = props.connection;
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

  await client.query(format("CREATE USER %I WITH PASSWORD %L", name, password));
  await client.end();
};
