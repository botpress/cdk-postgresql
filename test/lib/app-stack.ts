import { Database } from "@botpress/cdk-postgresql";
import * as cdk from "aws-cdk-lib";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface AppStackProps extends cdk.StackProps {
  cluster: rds.IDatabaseCluster;
  secret: secretsmanager.ISecret;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id);

    const { cluster, secret } = props;

    const db = new Database(this, "DB", {
      connection: {
        host: cluster.clusterEndpoint.hostname,
        port: cluster.clusterEndpoint.port,
        username: "admin",
        password: secret.secretValue.toString(),
      },
      name: "the_database_name",
      owner: "the_database_owner",
    });
  }
}
