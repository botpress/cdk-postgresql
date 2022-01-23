import { Construct } from "constructs";
import { Connection } from "./connection";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";

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
  password: string;
}

export class Role extends Construct {
  constructor(scope: Construct, id: string, props: RoleProps) {
    super(scope, id);

    const { connection } = props;

    const handler = new lambda.NodejsFunction(this, "OnEventHandler", {
      entry: path.join(__dirname, "lambda", "lib", "role.ts"),
      depsLockFilePath: path.join(__dirname, "lambda", "package-lock.json"),
      bundling: {
        nodeModules: ["pg", "pg-format"],
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.seconds(30),
      vpc: connection.vpc,
      vpcSubnets: connection.vpcSubnets,
      securityGroups: connection.securityGroups,
    });

    new cdk.CustomResource(this, "CustomResource", {
      serviceToken: handler.functionArn,
      resourceType: "Custom::Postgresql-Role",
      properties: {
        connection: {
          Host: connection.host,
          Port: connection.port || 5432,
          Database: connection.database || "postgres",
          Username: connection.username,
          PasswordArn: connection.password,
          PasswordField: connection.passwordField,
          SSLMode: connection.sslMode || "require",
        },
        name: props.name,
        passwordArn: props.password,
      },
      pascalCaseProperties: true,
    });
  }
}
