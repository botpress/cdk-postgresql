import { test } from "@jest/globals";
import { Template } from "aws-cdk-lib/assertions";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Database, Role } from "../lib";

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

    // but only 3 Functions:
    // * 1 for the DB handler (created by us)
    // * 1 for the DB provider (created by us)
    // * 1 for the LogRetention (created by the CDK))
    template.resourceCountIs("AWS::Lambda::Function", 3);
  });
});

describe("role", () => {
  test("has correct props", () => {
    const app = new cdk.App();
    const stack = new TestStack(app, "Stack");

    const connectionPassword = new secretsmanager.Secret(
      stack,
      "ConnectionPassword"
    );
    const rolePassword = new secretsmanager.Secret(stack, "RolePassword");

    const host = "somedb.com";
    const username = "theusername";
    const name = "rolename";

    new Role(stack, "Role", {
      name,
      password: rolePassword,
      connection: {
        host,
        password: connectionPassword,
        username,
      },
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("Custom::Postgresql-Role", 1);
    template.hasResourceProperties("Custom::Postgresql-Role", {
      Connection: {
        Host: host,
        Port: 5432,
        Database: "postgres",
        Username: username,
        PasswordArn: {
          Ref: getLogicalId(connectionPassword),
        },
        SSLMode: "require",
      },
      Name: name,
      PasswordArn: {
        Ref: getLogicalId(rolePassword),
      },
    });
  });

  test("creates singleton lambda", () => {
    const app = new cdk.App();
    const stack = new TestStack(app, "Stack");

    const connectionPassword = new secretsmanager.Secret(
      stack,
      "ConnectionPassword"
    );
    const rolePassword = new secretsmanager.Secret(stack, "RolePassword");

    const host = "somedb.com";
    const username = "theusername";
    const name = "mydb";
    const n = 5;

    for (let i = 0; i < n; i++) {
      new Role(stack, `Role${i}`, {
        name,
        password: rolePassword,
        connection: {
          host,
          password: connectionPassword,
          username,
        },
      });
    }

    const template = Template.fromStack(stack);

    // we expect n Roles
    template.resourceCountIs("Custom::Postgresql-Role", n);

    // but only 3 Functions:
    // * 1 for the Role handler (created by us)
    // * 1 for the Role provider (created by us)
    // * 1 for the LogRetention (created by the CDK))
    template.resourceCountIs("AWS::Lambda::Function", 3);
  });
});
