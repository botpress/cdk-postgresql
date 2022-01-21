import format from "pg-format";

import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from "aws-lambda/trigger/cloudformation-custom-resource";

import { validateconnection, connection, hashCode, createClient } from "./util";

interface Props {
  ServiceToken: string;
  connection: connection;
  Name: string;
  Password: string;
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
  await createRole(props.connection, props.Name, props.Password);
  return { PhysicalResourceId: generatePhysicalId(props) };
};

const handleUpdate = async (event: CloudFormationCustomResourceUpdateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);

  const oldProps = event.OldResourceProperties as Props;

  const oldPhysicalResourceId = generatePhysicalId(oldProps);
  const physicalResourceId = generatePhysicalId(props);

  if (physicalResourceId != oldPhysicalResourceId) {
    await createRole(props.connection, props.Name, props.Password);
    return { PhysicalResourceId: physicalResourceId };
  }

  if (props.Name != oldProps.Name) {
    await updateRoleName(props.connection, oldProps.Name, props.Name);
  }

  if (props.Password != oldProps.Password) {
    await updateRolePassword(props.connection, props.Name, props.Password);
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
  validateconnection(props.connection);

  if (!("Name" in props)) {
    throw "Name property is required";
  }
  if (!("Password" in props)) {
    throw "Password property is required";
  }
};

const generatePhysicalId = (props: Props): string => {
  const { Host, Port } = props.connection;
  const suffix = Math.abs(hashCode(`${Host}-${Port}`));
  return `role-${suffix}`;
};

export const deleteRole = async (connection: connection, name: string) => {
  console.log("Deleting user", name);
  const client = createClient(connection);
  await client.connect();

  await client.query(format("DROP USER %I", name));
  await client.end();
};

export const updateRoleName = async (
  connection: connection,
  oldName: string,
  newName: string
) => {
  console.log(`Updating role name from ${oldName} to ${newName}`);
  const client = createClient(connection);
  await client.connect();

  await client.query(format("ALTER ROLE %I RENAME TO %I", oldName, newName));
  await client.end();
};

export const updateRolePassword = async (
  connection: connection,
  name: string,
  password: string
) => {
  console.log("Updating user password", name);
  const client = createClient(connection);
  await client.connect();

  await client.query(format("ALTER USER %I WITH PASSWORD %L", name, password));
  await client.end();
};

export const createRole = async (
  connection: connection,
  name: string,
  password: string
) => {
  console.log("Creating user", name);
  const client = createClient(connection);
  await client.connect();

  await client.query(format("CREATE USER %I WITH PASSWORD %L", name, password));
  await client.end();
};
