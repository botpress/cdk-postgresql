const format = require("pg-format");
import {
  ConnectionInfo,
  createClient,
  validateConnectionInfo,
  hashCode,
} from "./util";

import { OnEventRequest } from "@aws-cdk/custom-resources/lib/provider-framework/types";

interface Props {
  ServiceToken: string;
  ConnectionInfo: ConnectionInfo;
  Name: string;
  Owner: string;
}

export const databaseHandler = async (event: OnEventRequest) => {
  switch (event.RequestType) {
    case "Create":
      return await handleCreate(event);
    case "Update":
      return await handleUpdate(event);
    case "Delete":
      return await handleDelete(event);
  }
};

const generatePhysicalId = (props: Props): string => {
  const { Host, Port } = props.ConnectionInfo;
  const suffix = Math.abs(hashCode(`${Host}-${Port}`));
  return `${props.Name}-${suffix}`;
};

const handleCreate = async (event: OnEventRequest) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await createDatabase(props.ConnectionInfo, props.Name, props.Owner);
  return { PhysicalResourceId: generatePhysicalId(props) };
};

const handleUpdate = async (event: OnEventRequest) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  const oldProps = event.OldResourceProperties as Props;

  const oldPhysicalResourceId = generatePhysicalId(oldProps);
  const physicalResourceId = generatePhysicalId(props);

  if (physicalResourceId != oldPhysicalResourceId) {
    await createDatabase(props.ConnectionInfo, props.Name, props.Owner);
    return { PhysicalResourceId: physicalResourceId };
  }

  if (props.Owner != oldProps.Owner) {
    await updateDbOwner(props.ConnectionInfo, props.Name, props.Owner);
  }

  return { PhysicalResourceId: physicalResourceId };
};

const handleDelete = async (event: OnEventRequest) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await deleteDatabase(props.ConnectionInfo, props.Name, props.Owner);
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
  if (!("Owner" in props)) {
    throw "Owner property is required";
  }
};

export const createDatabase = async (
  connectionInfo: ConnectionInfo,
  name: string,
  owner: string
) => {
  console.log("Creating database", name);
  const client = createClient(connectionInfo);
  await client.connect();

  await client.query(format("GRANT %I TO %I", owner, connectionInfo.Username));
  await client.query(format("CREATE DATABASE %I WITH OWNER %I", name, owner));
  await client.end();
  console.log("Created database");
};

export const deleteDatabase = async (
  connectionInfo: ConnectionInfo,
  name: string,
  owner: string
) => {
  console.log("Deleting database", name);
  const client = createClient(connectionInfo);
  await client.connect();

  // First, drop all remaining DB connections
  // Sometimes, DB connections are still alive even though the ECS service has been deleted
  await client.query(
    format(
      "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE datname=%L",
      name
    )
  );
  // Then, drop the DB
  await client.query(format("DROP DATABASE %I", name));
  await client.query(
    format("REVOKE %I FROM %I", owner, connectionInfo.Username)
  );
  await client.end();
};

export const updateDbOwner = async (
  connectionInfo: ConnectionInfo,
  name: string,
  owner: string
) => {
  console.log(`Updating DB ${name} owner to ${owner}`);
  const client = createClient(connectionInfo);
  await client.connect();

  await client.query(format("ALTER DATABASE %I OWNER TO %I", name, owner));
  await client.end();
};
