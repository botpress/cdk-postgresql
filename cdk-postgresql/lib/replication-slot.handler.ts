import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from "aws-lambda/trigger/cloudformation-custom-resource";

import { validateConnection, hashCode, getConnectedClient } from "./util";
import { Connection } from "./lambda.types";
import * as postgres from "./postgres";

interface Props {
  ServiceToken: string;
  Connection: Connection;
  Name: string;
  Plugin: string;
  RequiredPublication?: string;
}

const SLOT_PROVENANCES = ["created", "adopted"] as const;

/**
 * Whether this resource created the slot or adopted one that already existed.
 * It is recorded in the physical id, which CloudFormation hands back verbatim
 * on delete, so only a slot this resource created is ever dropped.
 */
type SlotProvenance = (typeof SLOT_PROVENANCES)[number];

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  switch (event.RequestType) {
    case "Create":
      return handleCreate(event);
    case "Update":
      return handleUpdate(event);
    case "Delete":
      return handleDelete(event);
  }
};

const handleCreate = async (event: CloudFormationCustomResourceCreateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);
  const provenance = await createSlotIfAbsent(props);
  return {
    PhysicalResourceId: buildPhysicalId({
      identity: deriveSlotIdentity(props),
      provenance,
    }),
  };
};

/**
 * A slot cannot be altered in place: the database it decodes and its name are
 * its identity, and its plugin is fixed at creation. A change to either half of
 * that identity reports a new physical id, so CloudFormation creates the new
 * slot and then deletes the old resource. A plugin change under an unchanged
 * identity is refused, because the existing slot would silently keep its old
 * plugin. An unchanged identity keeps the physical id it was given, so a slot
 * adopted at creation is never recorded as created.
 */
const handleUpdate = async (event: CloudFormationCustomResourceUpdateEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);

  const oldProps = event.OldResourceProperties as Props;
  const identity = deriveSlotIdentity(props);
  const { identity: currentIdentity } = parsePhysicalId(
    event.PhysicalResourceId
  );

  if (identity != currentIdentity) {
    const provenance = await createSlotIfAbsent(props);
    return { PhysicalResourceId: buildPhysicalId({ identity, provenance }) };
  }

  if (props.Plugin != oldProps.Plugin) {
    throw new Error(
      `The plugin of replication slot "${props.Name}" cannot change in place; drop and recreate the slot deliberately instead`
    );
  }

  return { PhysicalResourceId: event.PhysicalResourceId };
};

/**
 * Only a slot the physical id records this resource as having created is
 * dropped. A slot that was adopted, or one whose physical id carries no
 * provenance, may belong to someone else, and a dropped slot loses its
 * replication position permanently.
 */
const handleDelete = async (event: CloudFormationCustomResourceDeleteEvent) => {
  const props = event.ResourceProperties as Props;
  validateProps(props);

  const { provenance } = parsePhysicalId(event.PhysicalResourceId);
  if (provenance != "created") {
    console.log(
      "Not dropping replication slot, this resource did not create it",
      props.Name,
      provenance
    );
    return {};
  }

  console.log("Dropping replication slot", props.Name);
  const client = await getConnectedClient(props.Connection);

  try {
    await postgres.dropReplicationSlot({ client, name: props.Name });
  } finally {
    await client.end();
  }

  return {};
};

const validateProps = (props: Props) => {
  if (!("Connection" in props)) {
    throw "Connection property is required";
  }
  validateConnection(props.Connection);

  if (!("Name" in props)) {
    throw "Name property is required";
  }
  if (!("Plugin" in props)) {
    throw "Plugin property is required";
  }
};

const deriveSlotIdentity = (props: Props): string => {
  const { Host, Port, Database } = props.Connection;
  const suffix = Math.abs(
    hashCode(`${Host}-${Port}-${Database}-${props.Name}`)
  );
  return `replication-slot-${suffix}`;
};

const buildPhysicalId = (params: {
  identity: string;
  provenance: SlotProvenance;
}): string => `${params.identity}-${params.provenance}`;

/**
 * The one place that knows the shape of a physical id. An id carrying no
 * provenance suffix comes from the rollback of a failed create, and the guards
 * in the create path throw exactly when a slot this resource never created
 * already exists, so such an id reports "unknown" rather than "created".
 */
const parsePhysicalId = (
  physicalResourceId: string
): { identity: string; provenance: SlotProvenance | "unknown" } => {
  for (const provenance of SLOT_PROVENANCES) {
    const suffix = `-${provenance}`;
    if (physicalResourceId.endsWith(suffix)) {
      return {
        identity: physicalResourceId.slice(0, -suffix.length),
        provenance,
      };
    }
  }

  return { identity: physicalResourceId, provenance: "unknown" };
};

const createSlotIfAbsent = async (props: Props): Promise<SlotProvenance> => {
  const client = await getConnectedClient(props.Connection);

  try {
    if (props.RequiredPublication) {
      const { rows } = await client.query(
        "SELECT 1 FROM pg_publication WHERE pubname = $1",
        [props.RequiredPublication]
      );
      if (rows.length === 0) {
        // A slot created before its publication decodes from a catalog snapshot
        // in which the publication does not exist, and replication then fails
        // continuously, so refusing here turns a subtle runtime failure into a
        // loud deploy failure:
        throw new Error(
          `publication "${props.RequiredPublication}" does not exist in database "${props.Connection.Database}"; deploy the migration that creates it before this slot`
        );
      }
    }

    // `pg_replication_slots` lists the whole cluster, so a slot of the same
    // name decoding another database must not be adopted as this one; letting
    // Postgres raise "replication slot already exists" is the loud failure:
    const { rows: existingSlots } = await client.query(
      "SELECT plugin FROM pg_replication_slots WHERE slot_name = $1 AND database = current_database()",
      [props.Name]
    );
    const [existingSlot] = existingSlots;

    if (!existingSlot) {
      console.log("Creating replication slot", props.Name);
      await postgres.createReplicationSlot({
        client,
        name: props.Name,
        plugin: props.Plugin,
      });
      return "created";
    }

    if (existingSlot.plugin !== props.Plugin) {
      throw new Error(
        `replication slot "${props.Name}" already exists in database "${props.Connection.Database}" with plugin "${existingSlot.plugin}" instead of "${props.Plugin}"; a slot's plugin is fixed at creation, so drop and recreate the slot deliberately instead`
      );
    }

    console.log("Replication slot already exists", props.Name);
    return "adopted";
  } finally {
    await client.end();
  }
};
