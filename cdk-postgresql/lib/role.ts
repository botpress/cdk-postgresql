import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { RemovalPolicy } from "aws-cdk-lib";
import { Provider } from "./provider";

export interface RoleProps {
  /**
   * Provider required to connect to the Postgresql server
   */
  provider: Provider;

  /**
   * The name of the role. Must be unique on the PostgreSQL server instance where it is configured.
   */
  name: string;

  /**
   * Set the role's password
   */
  password: secretsmanager.ISecret;

  /**
   * Policy to apply when the role is removed from this stack.
   *
   * @default - The role will be orphaned.
   */
  removalPolicy?: RemovalPolicy;
}

export class Role extends Construct {
  public readonly name: string;

  constructor(scope: Construct, id: string, props: RoleProps) {
    super(scope, id);

    const { provider, name, password, removalPolicy } = props;

    password.grantRead(provider);

    const cr = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::Postgresql-Role",
      properties: {
        connection: provider.buildConnectionProperty(),
        name,
        passwordArn: password.secretArn,
      },
      pascalCaseProperties: true,
    });

    cr.applyRemovalPolicy(removalPolicy || cdk.RemovalPolicy.DESTROY);
    cr.node.addDependency(provider);

    this.name = cr.getAttString("Name");
  }
}
