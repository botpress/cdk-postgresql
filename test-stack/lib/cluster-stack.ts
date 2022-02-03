import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export class ClusterStack extends Stack {
  public readonly publicCluster: rds.IDatabaseCluster;
  public readonly privateCluster: rds.IDatabaseCluster;
  public readonly privateClusterSecurityGroup: ec2.ISecurityGroup;
  public readonly publicClusterSecret: secretsmanager.ISecret;
  public readonly privateClusterSecret: secretsmanager.ISecret;
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "VPC");
    this.vpc = vpc;

    const publicCluster = new rds.DatabaseCluster(this, "Cluster", {
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
    publicCluster.connections.allowFromAnyIpv4(
      ec2.Port.allTraffic(),
      "Open to the world"
    );

    const privateClusterSecurityGroup = new ec2.SecurityGroup(
      this,
      "privateClusterSecurityGroup",
      { vpc }
    );
    this.privateClusterSecurityGroup = privateClusterSecurityGroup;
    const privateCluster = new rds.DatabaseCluster(this, "PrivateCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_13_4,
      }),
      instanceProps: {
        vpc,
        securityGroups: [privateClusterSecurityGroup],
      },
    });
    this.publicCluster = publicCluster;
    this.privateCluster = privateCluster;

    if (publicCluster.secret) {
      this.publicClusterSecret = publicCluster.secret;
    } else {
      throw new Error("public cluster should have secret");
    }

    if (privateCluster.secret) {
      this.privateClusterSecret = privateCluster.secret;
    } else {
      throw new Error("private cluster should have secret");
    }
  }
}
