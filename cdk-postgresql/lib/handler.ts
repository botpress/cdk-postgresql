import { CloudFormationCustomResourceEvent } from "aws-lambda/trigger/cloudformation-custom-resource";

import { VError } from "verror";
import { handler as dbHandler } from "./database.handler";
import { handler as roleHandler } from "./role.handler";
import { handler as roleMembershipHandler } from "./role-membership.handler";

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  switch (event.ResourceType) {
    case "Custom::Postgresql-Role":
      return roleHandler(event);
    case "Custom::Postgresql-Database":
      return dbHandler(event);
    case "Custom::Postgresql-RoleMembership":
      return roleMembershipHandler(event);
    default:
      throw new VError(`unexpected ResourceType: ${event.ResourceType}`);
  }
};
