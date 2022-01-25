import { test, expect } from "@jest/globals";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Database } from "../lib";

class TestStack extends cdk.Stack {
  readonly exportPrefix: string;
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id);
  }
}

const getLogicalId = (construct: Construct) =>
  cdk.Stack.of(construct).getLogicalId(
    construct.node.defaultChild as cdk.CfnElement
  );

describe("database", () => {
  test("has correct props", () => {
    const app = new cdk.App();
    const stack = new TestStack(app, "Stack");

    const password = new secretsmanager.Secret(stack, "Password");

    const host = "somedb.com";
    const username = "theusername";
    const name = "mydb";
    const owner = "theowner";

    new Database(stack, "DB", {
      name,
      owner,
      connection: {
        host,
        password,
        username,
      },
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("Custom::Postgresql-Database", 1);
    template.hasResourceProperties("Custom::Postgresql-Database", {
      Connection: {
        Host: host,
        Port: 5432,
        Database: "postgres",
        Username: username,
        PasswordArn: {
          Ref: getLogicalId(password),
        },
        SSLMode: "require",
      },
      Name: name,
      Owner: owner,
    });
  });

  test("creates singleton lambda", () => {
    const app = new cdk.App();
    const stack = new TestStack(app, "Stack");

    const password = new secretsmanager.Secret(stack, "Password");

    const host = "somedb.com";
    const username = "theusername";
    const name = "mydb";
    const owner = "theowner";
    const n = 5;

    for (let i = 0; i < n; i++) {
      new Database(stack, `DB${i}`, {
        name,
        owner,
        connection: {
          host,
          password,
          username,
        },
      });
    }

    const template = Template.fromStack(stack);

    // we expect n DBs
    template.resourceCountIs("Custom::Postgresql-Database", n);

    // but only 2 Functions (1 for the DB handler (created by us), 1 for the LogRetention (created by the CDK))
    template.resourceCountIs("AWS::Lambda::Function", 2);
  });
});