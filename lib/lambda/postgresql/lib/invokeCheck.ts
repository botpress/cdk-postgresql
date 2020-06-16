import { OnEventRequest } from "@aws-cdk/custom-resources/lib/provider-framework/types";
import * as AWS from "aws-sdk";

export const invokeCheck = async (event: OnEventRequest) => {
  const lambda = new AWS.Lambda();
  const response = await lambda
    .invoke({ FunctionName: process.env.TARGET_FUNCTION_ARN! })
    .promise();
  console.log(`response:`, response);
  if (response.StatusCode !== 200) {
    throw "Unexpected status code";
  }
  return {};
};
