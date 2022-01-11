import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Database } from "@botpress/cdk-postgresql";

export class MyappStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "VPC");

    const cluster = new rds.DatabaseCluster(this, "Cluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_13_4,
      }),
      instanceProps: {
        vpc,
        // public so we can reach it over the internet for testing
        vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
      },
    });
    cluster.connections.allowFromAnyIpv4(
      ec2.Port.allTraffic(),
      "Open to the world"
    );

    // const db = new Database(this, "DB", {
    //   connectionInfo: {
    //     host: cluster.clusterEndpoint.hostname,
    //     port: cluster.clusterEndpoint.port,
    //     username: "admin",
    //     password: cluster.secret?.secretValue.toString(),
    //   },
    //   name: "the_database_name",
    //   owner: "the_database_owner",
    // });
  }
}
