import { roleHandler } from "./role";
import { databaseHandler } from "./database";
import { CloudFormationCustomResourceHandler } from "aws-lambda";
import {
  OnEventRequest,
  OnEventResponse,
} from "@aws-cdk/custom-resources/lib/provider-framework/types";
import { invokeCheck } from "./invokeCheck";
import * as cfnResponse from "./cfn-response";
import { log } from "./util";

export const handler = cfnResponse.safeHandler(async function (
  cfnRequest: AWSLambda.CloudFormationCustomResourceEvent
) {
  log("onEventHandler", cfnRequest);

  cfnRequest.ResourceProperties = cfnRequest.ResourceProperties || {};

  const onEventResult = await onEvent(cfnRequest);
  // merge the request and the result from onEvent to form the complete resource event
  // this also performs validation.
  const resourceEvent = createResponseEvent(cfnRequest, onEventResult);
  log("event:", onEventResult);

  return await cfnResponse.submitResponse("SUCCESS", resourceEvent);
});

const onEvent = async function (
  event: OnEventRequest
): Promise<OnEventResponse> {
  console.log(JSON.stringify(event));

  const resourceType = event.ResourceType;
  if (resourceType === "Custom::Postgresql-InvokeCheck") {
    return await invokeCheck(event);
  }
  if (resourceType === "Custom::Postgresql-Role") {
    return await roleHandler(event);
  }
  if (resourceType === "Custom::Postgresql-Database") {
    return await databaseHandler(event);
  }
  throw `Invalid resource type: ${resourceType}`;
};

function createResponseEvent(
  cfnRequest: AWSLambda.CloudFormationCustomResourceEvent,
  onEventResult: OnEventResponse
): AWSCDKAsyncCustomResource.IsCompleteRequest {
  //
  // validate that onEventResult always includes a PhysicalResourceId

  onEventResult = onEventResult || {};

  // if physical ID is not returned, we have some defaults for you based
  // on the request type.
  const physicalResourceId =
    onEventResult.PhysicalResourceId || defaultPhysicalResourceId(cfnRequest);

  // if we are in DELETE and physical ID was changed, it's an error.
  if (
    cfnRequest.RequestType === "Delete" &&
    physicalResourceId !== cfnRequest.PhysicalResourceId
  ) {
    throw new Error(
      `DELETE: cannot change the physical resource ID from "${cfnRequest.PhysicalResourceId}" to "${onEventResult.PhysicalResourceId}" during deletion`
    );
  }

  // if we are in UPDATE and physical ID was changed, it's a replacement (just log)
  if (
    cfnRequest.RequestType === "Update" &&
    physicalResourceId !== cfnRequest.PhysicalResourceId
  ) {
    log(
      `UPDATE: changing physical resource ID from "${cfnRequest.PhysicalResourceId}" to "${onEventResult.PhysicalResourceId}"`
    );
  }

  // merge request event and result event (result prevails).
  return {
    ...cfnRequest,
    ...onEventResult,
    PhysicalResourceId: physicalResourceId,
  };
}

/**
 * Calculates the default physical resource ID based in case user handler did
 * not return a PhysicalResourceId.
 *
 * For "CREATE", it uses the RequestId.
 * For "UPDATE" and "DELETE" and returns the current PhysicalResourceId (the one provided in `event`).
 */
function defaultPhysicalResourceId(
  req: AWSLambda.CloudFormationCustomResourceEvent
): string {
  switch (req.RequestType) {
    case "Create":
      return req.RequestId;

    case "Update":
    case "Delete":
      return req.PhysicalResourceId;

    default:
      throw new Error(
        `Invalid "RequestType" in request "${JSON.stringify(req)}"`
      );
  }
}
