import { Construct } from "constructs";
import { Connection } from "./connection";
import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { ensureSingletonProvider } from "./singleton-provider";

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
}

export class Role extends Construct {
  public readonly name: string;

  constructor(scope: Construct, id: string, props: RoleProps) {
    super(scope, id);

    const { connection, name, password } = props;

    const provider = ensureSingletonProvider(connection, cdk.Stack.of(this));

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

    this.name = cr.getAttString("Name");
  }
}
