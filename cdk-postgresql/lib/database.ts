import * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Provider } from "./provider";

export interface DatabaseProps {
  /**
   * Provider required to connect to the Postgresql server
   */
  provider: Provider;

  /**
   * The name of the database. Must be unique on the PostgreSQL server instance where it is configured.
   */
  name: string;

  /**
   * The role name of the user who will own the database
   */
  owner: string;

  /**
   * Policy to apply when the database is removed from this stack.
   *
   * @default - The database will be orphaned.
   */
  removalPolicy?: RemovalPolicy;
}

export class Database extends Construct {
  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const { provider, name, owner, removalPolicy } = props;

    const cr = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::Postgresql-Database",
      properties: {
        connection: provider.buildConnectionProperty(),
        name,
        owner,
      },
      pascalCaseProperties: true,
    });

    cr.applyRemovalPolicy(removalPolicy || cdk.RemovalPolicy.RETAIN);
    cr.node.addDependency(provider);
  }
}
