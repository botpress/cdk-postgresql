#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ClusterStack } from "../lib/cluster-stack";
import { AppStack } from "../lib/app-stack";

const stackName = process.env.STACK_NAME;
if (!stackName) {
  throw new Error("must specify appName");
}

const app = new cdk.App();
const {
  publicCluster,
  privateClusterSecurityGroup,
  privateCluster,
  vpc,
  privateClusterSecret,
  publicClusterSecret,
} = new ClusterStack(app, "PGTest");
new AppStack(app, stackName, {
  publicCluster,
  privateCluster,
  privateClusterSecurityGroup,
  publicClusterSecret,
  vpc,
  privateClusterSecret,
});
