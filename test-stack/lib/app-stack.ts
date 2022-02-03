import { Provider } from "@botpress/cdk-postgresql/lib/provider";
import * as cdk from "aws-cdk-lib";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { Role } from "@botpress/cdk-postgresql/lib/role";
import { Database } from "@botpress/cdk-postgresql/lib/database";

interface AppStackProps extends cdk.StackProps {
  publicCluster: rds.IDatabaseCluster;
  privateCluster: rds.IDatabaseCluster;
  privateClusterSecurityGroup: ec2.ISecurityGroup;
  publicClusterSecret: secretsmanager.ISecret;
  privateClusterSecret: secretsmanager.ISecret;
  vpc: ec2.IVpc;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id);

    const {
      publicCluster,
      publicClusterSecret,
      privateCluster,
      privateClusterSecurityGroup,
      privateClusterSecret,
      vpc,
    } = props;

    const rolePassword = new secretsmanager.Secret(this, "RolePassword");

    const privateProvider = new Provider(this, "PrivateProvider", {
      host: privateCluster.clusterEndpoint.hostname,
      port: privateCluster.clusterEndpoint.port,
      username: "postgres",
      password: privateClusterSecret,
      passwordField: "password",
      vpc,
      securityGroups: [privateClusterSecurityGroup],
    });

    const roleName = `role-${this.stackName}`;
    const dbName = `db-${this.stackName}`;

    const role = new Role(this, "Role", {
      provider: privateProvider,
      name: roleName,
      password: rolePassword,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const db = new Database(this, "DB", {
      provider: privateProvider,
      name: dbName,
      owner: roleName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    db.node.addDependency(role);
  }
}
