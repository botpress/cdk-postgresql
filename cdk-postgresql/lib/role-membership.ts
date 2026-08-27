import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import { Provider } from "./provider";

/**
 * Predefined roles, listed so they auto-complete in vscode.
 */
export type PredefinedRoleName =
  | "rds_replication"
  | "rds_superuser"
  | "rds_iam"
  | "rds_password"
  | "pg_monitor"
  | "pg_read_all_data"
  | "pg_write_all_data"
  | "pg_read_all_settings"
  | "pg_read_all_stats"
  | "pg_stat_scan_tables"
  | "pg_signal_backend";

export interface RoleMembershipProps {
  /**
   * Provider required to connect to the Postgresql server
   */
  provider: Provider;

  /**
   * The role whose membership is granted, as in `GRANT <role> TO <member>`. It
   * has to exist already, whether it is predefined or was created elsewhere in
   * the stack.
   */
  role: PredefinedRoleName | (string & {});

  /**
   * The role receiving the membership, as in `GRANT <role> TO <member>`. It
   * has to exist already, like the role it is made a member of.
   */
  member: string;

  /**
   * Policy to apply when the membership is removed from this stack.
   *
   * @default - The membership will be revoked.
   */
  removalPolicy?: RemovalPolicy;
}

/**
 * Membership of one Postgresql role in another, which is how a role receives
 * privileges it cannot be granted directly. On RDS and Aurora the master role
 * cannot grant the replication attribute, so a role that has to read the
 * write-ahead log is made a member of `rds_replication` instead.
 *
 * Both roles are named by plain strings, which creates no CloudFormation
 * dependency. When either of them is created by a `Role` construct in the same
 * stack, call `addDependency` on this construct so that the grant does not run
 * first and fail with `role "..." does not exist`.
 */
export class RoleMembership extends Construct {
  constructor(scope: Construct, id: string, props: RoleMembershipProps) {
    super(scope, id);

    const { provider, role, member, removalPolicy } = props;

    const cr = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::Postgresql-RoleMembership",
      properties: {
        connection: provider.buildConnectionProperty(),
        role,
        member,
      },
      pascalCaseProperties: true,
    });

    cr.applyRemovalPolicy(removalPolicy || cdk.RemovalPolicy.DESTROY);
    cr.node.addDependency(provider);
  }
}
