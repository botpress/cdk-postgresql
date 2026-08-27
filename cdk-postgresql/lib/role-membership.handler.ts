import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from "aws-lambda/trigger/cloudformation-custom-resource";

import { validateConnection, hashCode, getConnectedClient } from "./util";
import { Connection } from "./lambda.types";
import * as postgres from "./postgres";

interface Props {
  ServiceToken: string;
  Connection: Connection;
  Role: string;
  Member: string;
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
  await grantRoleMembership(props.Connection, props.Role, props.Member);
  return {
    PhysicalResourceId: generatePhysicalId(props),
  };
};

/**
 * Returning a physical id that encodes both the role and the member makes
 * CloudFormation grant the new membership and then revoke the old one whenever
 * either of them changes, which is safe because the two are never the same grant.
 */
const handleUpdate = async (event: CloudFormationCustomResourceUpdateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);

  const physicalResourceId = generatePhysicalId(props);
  const isDifferentMembership = physicalResourceId != event.PhysicalResourceId;

  if (isDifferentMembership) {
    await grantRoleMembership(props.Connection, props.Role, props.Member);
  }

  return { PhysicalResourceId: physicalResourceId };
};

const handleDelete = async (event: CloudFormationCustomResourceDeleteEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  await revokeRoleMembership(props.Connection, props.Role, props.Member);
  return {};
};

const validateProps = (props: Props) => {
  if (!("Connection" in props)) {
    throw "Connection property is required";
  }
  validateConnection(props.Connection);

  if (!("Role" in props)) {
    throw "Role property is required";
  }
  if (!("Member" in props)) {
    throw "Member property is required";
  }
};

const generatePhysicalId = (props: Props): string => {
  const { Host, Port } = props.Connection;
  const suffix = Math.abs(
    hashCode(JSON.stringify([Host, Port, props.Role, props.Member]))
  );
  return `role-membership-${suffix}`;
};

export const grantRoleMembership = async (
  connection: Connection,
  role: string,
  member: string
) => {
  console.log(`Granting ${role} to ${member}`);
  const client = await getConnectedClient(connection);

  try {
    await postgres.grantRoleMembership({ client, role, member });
  } finally {
    await client.end();
  }
};

export const revokeRoleMembership = async (
  connection: Connection,
  role: string,
  member: string
) => {
  console.log(`Revoking ${role} from ${member}`);
  const client = await getConnectedClient(connection);

  try {
    await postgres.revokeRoleMembership({ client, role, member });
  } finally {
    await client.end();
  }
};
