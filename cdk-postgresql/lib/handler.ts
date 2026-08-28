import { CloudFormationCustomResourceEvent } from "aws-lambda/trigger/cloudformation-custom-resource";

import { VError } from "verror";
import { handler as dbHandler } from "./database.handler";
import { handler as roleHandler } from "./role.handler";
import { handler as roleMembershipHandler } from "./role-membership.handler";
import { handler as replicationSlotHandler } from "./replication-slot.handler";

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  switch (event.ResourceType) {
    case "Custom::Postgresql-Role":
      return roleHandler(event);
    case "Custom::Postgresql-Database":
      return dbHandler(event);
    case "Custom::Postgresql-RoleMembership":
      return roleMembershipHandler(event);
    case "Custom::Postgresql-ReplicationSlot":
      return replicationSlotHandler(event);
    default:
      throw new VError(`unexpected ResourceType: ${event.ResourceType}`);
  }
};
