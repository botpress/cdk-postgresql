import { Construct } from "constructs";
import { Connection } from "./connection";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cr from "aws-cdk-lib/custom-resources";
import path from "path";

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

    const provider = this.ensureSingletonProvider(connection, password);

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

  /**
   * We want 1 shared provider for multiple Role constructs
   */
  private ensureSingletonProvider(
    connection: Connection,
    password: secretsmanager.ISecret
  ): cr.Provider {
    const constructId = "cdk-postgresql:role:provider";
    const existing = cdk.Stack.of(this).node.tryFindChild(constructId);
    if (existing) {
      return existing as cr.Provider;
    } else {
      const handler = new lambda.NodejsFunction(
        cdk.Stack.of(this),
        constructId + "-handler",
        {
          entry: path.join(__dirname, "role.handler.js"),
          bundling: {
            nodeModules: ["pg", "pg-format"],
          },
          logRetention: logs.RetentionDays.ONE_MONTH,
          timeout: cdk.Duration.seconds(30),
          vpc: connection.vpc,
          vpcSubnets: connection.vpcSubnets,
          securityGroups: connection.securityGroups,
        }
      );

      connection.password.grantRead(handler);
      password.grantRead(handler);

      return new cr.Provider(cdk.Stack.of(this), constructId, {
        onEventHandler: handler,
        logRetention: logs.RetentionDays.ONE_MONTH,
      });
    }
  }
}
