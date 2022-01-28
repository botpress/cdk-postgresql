import { Construct } from "constructs";
import { Connection } from "./connection";
import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { ensureSingletonProvider } from "./singleton-provider";
import { RemovalPolicy } from "aws-cdk-lib";

export interface RoleProps {
  /**
   * Connection required to connect to the Postgresql server
   */
  connection: Connection;

  /**
   * The name of the role. Must be unique on the PostgreSQL server instance where it is configured.
   */
  name: string;

  /**
   * Set the role's password
   */
  password: secretsmanager.ISecret;

  /**
   * Policy to apply when the role is removed from this stack.
   *
   * @default - The role will be orphaned.
   */
  removalPolicy?: RemovalPolicy;
}

export class Role extends Construct {
  public readonly name: string;

  constructor(scope: Construct, id: string, props: RoleProps) {
    super(scope, id);

    const { connection, name, password, removalPolicy } = props;

    const { provider, handler } = ensureSingletonProvider(
      connection,
      cdk.Stack.of(this)
    );

    password.grantRead(handler);

    const cr = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::Postgresql-Role",
      properties: {
        connection: {
          Host: connection.host,
          Port: connection.port || 5432,
          Database: connection.database || "postgres",
          Username: connection.username,
          PasswordArn: connection.password.secretArn,
          PasswordField: connection.passwordField,
          SSLMode: connection.sslMode || "require",
        },
        name,
        passwordArn: password.secretArn,
      },
      pascalCaseProperties: true,
    });

    cr.applyRemovalPolicy(removalPolicy || cdk.RemovalPolicy.RETAIN);

    this.name = cr.getAttString("Name");
  }
}
