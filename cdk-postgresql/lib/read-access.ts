import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { Provider } from "./provider";

export interface ReadAccessProps {
  provider: Provider;
  database: string;
  /** Existing role. Does not create a login or change its credentials. */
  role: string;
  /** @default public */
  schema?: string;
  /** Roles that create future tables, not the reader role. Must exist. */
  creatorRoles: string[];
  /** Grant a cluster-wide RLS exemption. Omitted/false leaves RLS attributes unchanged. */
  bypassRls?: boolean;
}

/**
 * Additive read access to existing and future tables in one database/schema.
 * Reuses the provider Lambda. Grants are retained on removal and on scope
 * changes: revoke obsolete access explicitly. Does not revoke pre-existing writes.
 * Add dependencies on any roles/database created in the same stack.
 */
export class ReadAccess extends Construct {
  constructor(scope: Construct, id: string, props: ReadAccessProps) {
    super(scope, id);
    if (!props.creatorRoles.length) {
      throw new Error("creatorRoles must contain at least one table creator");
    }
    const resource = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: props.provider.serviceToken,
      resourceType: "Custom::Postgresql-ReadAccess",
      properties: {
        connection: {
          ...props.provider.buildConnectionProperty(),
          Database: props.database,
        },
        role: props.role,
        schema: props.schema ?? "public",
        creatorRoles: props.creatorRoles,
        bypassRls: props.bypassRls ?? false,
      },
      pascalCaseProperties: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    resource.node.addDependency(props.provider);
  }
}
