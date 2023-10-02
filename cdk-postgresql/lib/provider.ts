import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import path from "path";
import { Connection, SSLMode } from "./lambda.types";

interface ProviderProps {
  /**
   * The address for the server connection
   */
  host: string;

  /**
   * The port for the server connection
   *
   * @default - 5432
   */
  port?: number;

  /**
   * Database to connect to
   *
   * @default - "postgres"
   */
  database?: string;

  /**
   * Username for the server connection
   */
  username: string;

  /**
   * Password for the server connection
   */
  password: secretsmanager.ISecret;

  /**
   * Field to get from the password, in case the password is a object
   */
  passwordField?: string;

  /**
   * Set the priority for an SSL connection to the server
   *
   * @default - "require"
   */
  sslMode?: "require" | "disable";

  /**
   * VPC network to place the Provider Lambda network interfaces
   *
   * @default - "Provider is not placed within a VPC"
   */
  vpc?: ec2.IVpc;

  /**
   * The Provider Lambda will be granted inbound access
   * on the specified port for each of the specified Security Groups.
   *
   * @default - "The Lambda has no access to any Security Groups"
   */
  securityGroups?: ec2.ISecurityGroup[];
}

export class Provider extends Construct implements iam.IGrantable {
  readonly grantPrincipal: cdk.aws_iam.IPrincipal;
  readonly serviceToken: string;

  private readonly host: string;
  private readonly port: number;
  private readonly username: string;
  private readonly database: string;
  private readonly sslMode: SSLMode;
  private readonly password: secretsmanager.ISecret;
  private readonly passwordField?: string;

  constructor(scope: Construct, id: string, props: ProviderProps) {
    super(scope, id);

    const { vpc, securityGroups } = props;

    this.host = props.host;
    this.username = props.username;
    this.port = props.port || 5432;
    this.database = props.database || "postgres";
    this.sslMode = props.sslMode || "require";
    this.password = props.password;
    this.passwordField = props.passwordField;

    const handlerSecurityGroup = vpc
      ? new ec2.SecurityGroup(this, "HandlerSecurityGroup", { vpc })
      : undefined;
    const handlerSecurityGroups = handlerSecurityGroup
      ? [handlerSecurityGroup]
      : undefined;
    const handler = new lambdaNode.NodejsFunction(scope, "handler", {
      entry: path.join(__dirname, "handler.js"),
      bundling: {
        nodeModules: ["pg", "pg-format"],
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.minutes(15),
      vpc,
      securityGroups: handlerSecurityGroups,
      runtime: lambda.Runtime.NODEJS_18_X,
    });
    this.grantPrincipal = handler.grantPrincipal;

    this.password.grantRead(handler);

    const provider = new cr.Provider(scope, "cr-provider", {
      onEventHandler: handler,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    this.serviceToken = provider.serviceToken;

    if (securityGroups && handlerSecurityGroup) {
      for (const s of securityGroups) {
        s.addIngressRule(
          handlerSecurityGroup,
          ec2.Port.tcp(this.port),
          "cdk-postgresql provider",
          true
        );
      }
    }
  }

  public buildConnectionProperty(): Connection {
    return {
      Host: this.host,
      Username: this.username,
      Port: this.port,
      Database: this.database,
      SSLMode: this.sslMode,
      PasswordArn: this.password.secretArn,
      PasswordField: this.passwordField,
    };
  }
}
