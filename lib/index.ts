import cdk = require("@aws-cdk/core");
import lambda = require("@aws-cdk/aws-lambda");
import ec2 = require("@aws-cdk/aws-ec2");
import logs = require("@aws-cdk/aws-logs");
import path = require("path");

export interface ConnectionInfo {
  /**
   * The address for the postgresql server connection
   */
  host: string;

  /**
   * The port for the postgresql server connection
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
  password?: string;

  /**
   * Set the priority for an SSL connection to the server
   *
   * @default - "require"
   */
  sslMode?: "require" | "disable";
}

interface ProviderProps {
  /**
   * VPC network to place Lambda network interfaces
   *
   * @default - "Function is not placed within a VPC"
   */
  vpc?: ec2.IVpc;

  /**
   * Where to place the network interfaces within the VPC.
   *
   * Only used if 'vpc' is supplied. Note: internet access for Lambdas requires a NAT gateway, so picking Public subnets is not allowed.
   *
   * @default - "the Vpc default strategy if not specified"
   */
  vpcSubnets?: ec2.SubnetSelection;

  /**
   * The list of security groups to associate with the Lambda's network interfaces.
   *
   * Only used if 'vpc' is supplied.
   *
   * @default - "If the function is placed within a VPC and a security group is
   * not specified, either by this or securityGroup prop, a dedicated security
   * group will be created for this function."
   */

  securityGroups?: ec2.ISecurityGroup[];
}

export class Provider extends cdk.Construct {
  // /**
  //  * The custom resource provider.
  //  */
  // public readonly provider: cr.Provider;

  /**
   * The onEvent handler
   */
  public readonly onEventHandler: lambda.Function;

  constructor(scope: cdk.Construct, id: string, props?: ProviderProps) {
    super(scope, id);

    this.onEventHandler = new lambda.Function(this, "OnEventHandler", {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "lib/index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "lambda", "postgresql")),
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.seconds(30),
      vpc: props?.vpc,
      vpcSubnets: props?.vpcSubnets,
      securityGroups: props?.securityGroups,
    });
  }
}

export interface DatabaseProps {
  /**
   * Configuration required to connect to the Postgresql server
   */
  connectionInfo: ConnectionInfo;

  /**
   * The name of the database. Must be unique on the PostgreSQL server instance where it is configured.
   */
  name: string;

  /**
   * The role name of the user who will own the database
   */
  owner: string;

  /**
   * The provider to use
   */
  provider?: Provider;
}

export class Database extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const { connectionInfo } = props;
    const provider = props.provider || new Provider(this, "Provider");

    new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.onEventHandler.functionArn,
      resourceType: "Custom::Postgresql-Database",
      properties: {
        connectionInfo: {
          Host: connectionInfo.host,
          Port: connectionInfo.port || 5432,
          Database: connectionInfo.database || "postgres",
          Username: connectionInfo.username,
          Password: connectionInfo.password || "",
          SSLMode: connectionInfo.sslMode || "require",
        },
        name: props.name,
        owner: props.owner,
      },
      pascalCaseProperties: true,
    });
  }
}

export interface RoleProps {
  /**
   * Configuration required to connect to the Postgresql server
   */
  connectionInfo: ConnectionInfo;

  /**
   * The name of the role. Must be unique on the PostgreSQL server instance where it is configured.
   */
  name: string;

  /**
   * Set the role's password
   */
  password: string;

  /**
   * The provider to use
   */
  provider?: Provider;
}
export class Role extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: RoleProps) {
    super(scope, id);

    const { connectionInfo } = props;
    const provider = props.provider || new Provider(this, "Provider");

    new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.onEventHandler.functionArn,
      resourceType: "Custom::Postgresql-Role",
      properties: {
        connectionInfo: {
          Host: connectionInfo.host,
          Port: connectionInfo.port || 5432,
          Database: connectionInfo.database || "postgres",
          Username: connectionInfo.username,
          Password: connectionInfo.password || "",
          SSLMode: connectionInfo.sslMode || "require",
        },
        name: props.name,
        password: props.password,
      },
      pascalCaseProperties: true,
    });
  }
}
