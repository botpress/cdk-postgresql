import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import { Provider } from "./provider";

export interface ReplicationSlotProps {
  /**
   * Provider required to connect to the Postgresql server. Logical slots decode
   * one database, the one the provider's `database` prop names.
   */
  provider: Provider;

  /**
   * The name of the slot. Must be unique on the PostgreSQL server instance
   * where it is configured.
   */
  name: string;

  /**
   * The logical decoding plugin the slot is created with. It cannot change
   * after creation.
   *
   * @default - "pgoutput"
   */
  plugin?: string;

  /**
   * A publication that has to exist before the slot is created. A slot created
   * earlier decodes from a catalog snapshot in which the publication does not
   * exist, and replication fails continuously, so creation is refused until
   * the publication is there.
   */
  requiredPublication?: string;

  /**
   * Policy to apply when the slot is removed from this stack. A dropped slot
   * loses its position permanently, so stacks that replicate production data
   * should retain it.
   *
   * @default - The slot will be dropped.
   */
  removalPolicy?: RemovalPolicy;
}

/**
 * A PostgreSQL logical replication slot. The database retains write-ahead-log
 * data until the slot's consumer confirms having read it, which is what makes
 * replication resumable after the consumer restarts.
 *
 * A slot that already exists on the same database with the same plugin is
 * adopted and managed in place, and removing the resource only ever drops a
 * slot this resource itself created.
 */
export class ReplicationSlot extends Construct {
  constructor(scope: Construct, id: string, props: ReplicationSlotProps) {
    super(scope, id);

    const { provider, name, plugin, requiredPublication, removalPolicy } = props;

    const cr = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::Postgresql-ReplicationSlot",
      properties: {
        connection: provider.buildConnectionProperty(),
        name,
        plugin: plugin ?? "pgoutput",
        requiredPublication,
      },
      pascalCaseProperties: true,
    });

    cr.applyRemovalPolicy(removalPolicy || cdk.RemovalPolicy.DESTROY);
    cr.node.addDependency(provider);
  }
}
