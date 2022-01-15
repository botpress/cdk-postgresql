import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { Connection } from "./connection";

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
  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const { connection } = props;

    const handler = new lambda.NodejsFunction(this, "OnEventHandler", {
      entry: "lib/lambda/database.ts",
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.seconds(30),
      vpc: connection.vpc,
      vpcSubnets: connection.vpcSubnets,
      securityGroups: connection.securityGroups,
    });

    new cdk.CustomResource(this, "CustomResource", {
      serviceToken: handler.functionArn,
      resourceType: "Custom::Postgresql-Database",
      properties: {
        connection: {
          Host: connection.host,
          Port: connection.port || 5432,
          Database: connection.database || "postgres",
          Username: connection.username,
          Password: connection.password || "",
          SSLMode: connection.sslMode || "require",
        },
        name: props.name,
        owner: props.owner,
      },
      pascalCaseProperties: true,
    });
  }
}
