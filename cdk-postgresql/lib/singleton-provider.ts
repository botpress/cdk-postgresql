import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";
import path from "path";
import { Connection } from "./connection";

const PROVIDER_CONSTRUCT_ID = "cdk-postgresql:provider";
const HANDLER_CONSTRUCT_ID = "cdk-postgresql:handler";

/**
 * We want 1 shared provider for multiple Database and Role constructs
 */
export const ensureSingletonProvider = (
  connection: Connection,
  stack: cdk.Stack
): { provider: cr.Provider; handler: lambda.NodejsFunction } => {
  const existingProvider = stack.node.tryFindChild(PROVIDER_CONSTRUCT_ID);
  const existingHandler = stack.node.tryFindChild(HANDLER_CONSTRUCT_ID);
  if (existingProvider && existingHandler) {
    return {
      provider: existingProvider as cr.Provider,
      handler: existingHandler as lambda.NodejsFunction,
    };
  } else {
    const handler = new lambda.NodejsFunction(stack, HANDLER_CONSTRUCT_ID, {
      entry: path.join(__dirname, "handler.js"),
      bundling: {
        nodeModules: ["pg", "pg-format"],
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.seconds(30),
      vpc: connection.vpc,
      vpcSubnets: connection.vpcSubnets,
      securityGroups: connection.securityGroups,
    });

    connection.password.grantRead(handler);

    const provider = new cr.Provider(stack, PROVIDER_CONSTRUCT_ID, {
      onEventHandler: handler,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    return { handler, provider };
  }
};
