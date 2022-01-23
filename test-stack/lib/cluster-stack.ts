import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export class ClusterStack extends Stack {
  public readonly cluster: rds.IDatabaseCluster;
  public readonly secret: secretsmanager.ISecret;

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
        publiclyAccessible: true,
      },
    });
    cluster.connections.allowFromAnyIpv4(
      ec2.Port.allTraffic(),
      "Open to the world"
    );

    this.cluster = cluster;
    if (cluster.secret) {
      this.secret = cluster.secret;
    } else {
      throw new Error("cluster should have secret");
    }
  }
}
