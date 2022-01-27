import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Connection } from "./connection";
import { ensureSingletonProvider } from "./singleton-provider";

export interface DatabaseProps {
  /**
   * Connection required to connect to the Postgresql server
   */
  connection: Connection;

  /**
   * The name of the database. Must be unique on the PostgreSQL server instance where it is configured.
   */
  name: string;

  /**
   * The role name of the user who will own the database
   */
  owner: string;
}

export class Database extends Construct {
  public readonly name: string;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const { connection, name, owner } = props;

    const provider = ensureSingletonProvider(connection, cdk.Stack.of(this));

    const cr = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::Postgresql-Database",
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
        owner,
      },
      pascalCaseProperties: true,
    });

    this.name = cr.getAttString("Name");
  }
}
