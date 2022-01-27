import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";
import path from "path";
import { Connection } from "./connection";

const CONSTRUCT_ID = "cdk-postgresql:provider";

/**
 * We want 1 shared provider for multiple Database constructs
 */
export const ensureSingletonProvider = (
  connection: Connection,
  stack: cdk.Stack
): cr.Provider => {
  const existing = stack.node.tryFindChild(CONSTRUCT_ID);
  if (existing) {
    return existing as cr.Provider;
  } else {
    const handler = new lambda.NodejsFunction(
      stack,
      CONSTRUCT_ID + "-handler",
      {
        entry: path.join(__dirname, "database.handler.js"),
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

    return new cr.Provider(stack, CONSTRUCT_ID, {
      onEventHandler: handler,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
  }
};
