import { CloudFormationCustomResourceEvent } from "aws-lambda/trigger/cloudformation-custom-resource";
import { escapeIdentifier as quote } from "pg";
import { Connection } from "./lambda.types";
import { getConnectedClient, validateConnection } from "./util";

interface Props {
  Connection: Connection;
  Role: string;
  Schema: string;
  CreatorRoles: string[];
  GrantBypassRls: boolean | "true" | "false";
}

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  // Also retain adopted grants on failed-create rollback. Never delete a login.
  if (event.RequestType === "Delete") return {};
  const props = event.ResourceProperties as unknown as Props;
  validateConnection(props.Connection);
  if (!props.Role || !props.Schema || !props.CreatorRoles?.length) {
    throw new Error("Role, Schema and non-empty CreatorRoles are required");
  }
  const role = quote(props.Role);
  const schema = quote(props.Schema);
  const creators = props.CreatorRoles.map(quote).join(", ");
  const bypass = props.GrantBypassRls === true || props.GrantBypassRls === "true";
  const client = await getConnectedClient(props.Connection);
  try {
    await client.query(`
      BEGIN;
      SET LOCAL lock_timeout = '5s';
      SET LOCAL statement_timeout = '30s';
      GRANT CONNECT ON DATABASE ${quote(props.Connection.Database)} TO ${role};
      GRANT USAGE ON SCHEMA ${schema} TO ${role};
      GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role};
      ALTER DEFAULT PRIVILEGES FOR ROLE ${creators} IN SCHEMA ${schema} GRANT SELECT ON TABLES TO ${role};
      ${bypass ? `ALTER ROLE ${role} BYPASSRLS;` : ""}
      COMMIT;
    `);
  } finally {
    // Disconnecting also rolls back the transaction if any statement failed.
    await client.end();
  }
  return {
    PhysicalResourceId: event.RequestType === "Update"
      ? event.PhysicalResourceId
      : event.LogicalResourceId,
  };
};
