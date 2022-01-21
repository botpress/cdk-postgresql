#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ClusterStack } from "../lib/cluster-stack";
import { AppStack } from "../lib/app-stack";

const app = new cdk.App();
const { cluster, secret } = new ClusterStack(app, "PGTest");
new AppStack(app, "AppStack", { cluster, secret });
