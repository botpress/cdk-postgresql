import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface Connection {
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
