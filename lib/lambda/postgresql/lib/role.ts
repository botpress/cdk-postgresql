const AWS = require("aws-sdk");
const format = require("pg-format");
const secretsmanager = new AWS.SecretsManager();
const { Client } = require("pg");

import { OnEventRequest } from "@aws-cdk/custom-resources/lib/provider-framework/types";
import {
  validateConnectionInfo,
  ConnectionInfo,
  hashCode,
  createClient,
} from "./util";

interface Props {
  ServiceToken: string;
  ConnectionInfo: ConnectionInfo;
  Name: string;
  Password: string;
}

export const roleHandler = async (event: OnEventRequest) => {
  switch (event.RequestType) {
    case "Create":
      return await handleCreate(event);
    case "Update":
      return await handleUpdate(event);
    case "Delete":
      return await handleDelete(event);
  }
};

const handleCreate = async (event: OnEventRequest) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await createRole(props.ConnectionInfo, props.Name, props.Password);
  return { PhysicalResourceId: generatePhysicalId(props) };
};

const handleUpdate = async (event: OnEventRequest) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);

  const oldProps = event.OldResourceProperties as Props;

  const oldPhysicalResourceId = generatePhysicalId(oldProps);
  const physicalResourceId = generatePhysicalId(props);

  if (physicalResourceId != oldPhysicalResourceId) {
    await createRole(props.ConnectionInfo, props.Name, props.Password);
    return { PhysicalResourceId: physicalResourceId };
  }

  if (props.Name != oldProps.Name) {
    await updateRoleName(props.ConnectionInfo, oldProps.Name, props.Name);
  }

  if (props.Password != oldProps.Password) {
    await updateRolePassword(props.ConnectionInfo, props.Name, props.Password);
  }

  return { PhysicalResourceId: physicalResourceId };
};

const handleDelete = async (event: OnEventRequest) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await deleteRole(props.ConnectionInfo, props.Name);
  return {};
};

const validateProps = (props: Props) => {
  if (!("ConnectionInfo" in props)) {
    throw "ConnectionInfo property is required";
  }
  validateConnectionInfo(props.ConnectionInfo);

  if (!("Name" in props)) {
    throw "Name property is required";
  }
  if (!("Password" in props)) {
    throw "Password property is required";
  }
};

const generatePhysicalId = (props: Props): string => {
  const { Host, Port } = props.ConnectionInfo;
  const suffix = Math.abs(hashCode(`${Host}-${Port}`));
  return `role-${suffix}`;
};

export const deleteRole = async (
  connectionInfo: ConnectionInfo,
  name: string
) => {
  console.log("Deleting user", name);
  const client = createClient(connectionInfo);
  await client.connect();

  await client.query(format("DROP USER %I", name));
  await client.end();
};

export const updateRoleName = async (
  connectionInfo: ConnectionInfo,
  oldName: string,
  newName: string
) => {
  console.log(`Updating role name from ${oldName} to ${newName}`);
  const client = createClient(connectionInfo);
  await client.connect();

  await client.query(format("ALTER ROLE %I RENAME TO %I", oldName, newName));
  await client.end();
};

export const updateRolePassword = async (
  connectionInfo: ConnectionInfo,
  name: string,
  password: string
) => {
  console.log("Updating user password", name);
  const client = createClient(connectionInfo);
  await client.connect();

  await client.query(format("ALTER USER %I WITH PASSWORD %L", name, password));
  await client.end();
};

export const createRole = async (
  connectionInfo: ConnectionInfo,
  name: string,
  password: string
) => {
  console.log("Creating user", name);
  const client = createClient(connectionInfo);
  await client.connect();

  await client.query(format("CREATE USER %I WITH PASSWORD %L", name, password));
  await client.end();
};
