import { handler as dbHandler } from "../lib/database.handler";
import { handler as roleHandler } from "../lib/role.handler";
import { GenericContainer, StartedTestContainer } from "testcontainers";
import ms from "ms";
import {
  CreateDatabaseEvent,
  CreateRoleEvent,
  DeleteDatabaseEvent,
  DeleteRoleEvent,
  UpdateDatabaseEvent,
  UpdateRoleEvent,
} from "../lib/lambda.types";
import { Client } from "pg";
import { createDatabase, createRole } from "../lib/postgres";
import { handler as roleMembershipHandler } from "../lib/role-membership.handler";
import { createSecret, dbExists, getDbOwner, isMemberOf, roleExists } from "./helpers";
import { secretsmanager } from "../lib/util";
import { beforeEach, afterEach, describe, test, expect, vi } from "vitest";
import { createRequire } from "node:module";

const DB_PORT = 5432;
const DB_MASTER_USERNAME = "postgres";
const DB_MASTER_PASSWORD = "masterpwd";
const DB_DEFAULT_DB = "postgres";
const LOCALSTACK_PORT = 4566;

// The AWS SDK resolves AWS_ENDPOINT_URL once per client and caches it, and
// lib/util.ts holds a single client for the whole process, so LocalStack has
// to answer on the same host port for every test in this file:
const LOCALSTACK_HOST_PORT = 14566;

let pgContainer: StartedTestContainer;
let localstackContainer: StartedTestContainer;
let masterPasswordArn: string;
let pgHost: string;
let pgPort: number;

beforeEach(async () => {
  pgContainer = await new GenericContainer("postgres:16")
    .withExposedPorts(DB_PORT)
    .withEnvironment({ POSTGRES_PASSWORD: DB_MASTER_PASSWORD })
    .start();
  localstackContainer = await new GenericContainer("localstack/localstack:3")
    .withEnvironment({ SERVICES: "secretsmanager" })
    .withExposedPorts({ container: LOCALSTACK_PORT, host: LOCALSTACK_HOST_PORT })
    .start();

  pgHost = pgContainer.getHost();
  pgPort = pgContainer.getMappedPort(DB_PORT);

  vi.stubEnv("AWS_ENDPOINT_URL", `http://localhost:${LOCALSTACK_HOST_PORT}`);
  masterPasswordArn = await createSecret(secretsmanager, DB_MASTER_PASSWORD);
}, ms("2m"));

afterEach(async () => {
  vi.unstubAllEnvs();
  await pgContainer?.stop();
  await localstackContainer?.stop();
});

describe("role", () => {
  test("create", async () => {
    const newRolePwd = "rolepwd";
    const rolePasswordArn = await createSecret(secretsmanager, newRolePwd);

    const newRoleName = "myuser";

    const event: CreateRoleEvent = {
      RequestType: "Create",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newRoleName,
        PasswordArn: rolePasswordArn,
      },
    };

    await roleHandler(event);

    // try connecting as the new role
    const client = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: newRoleName,
      password: newRolePwd,
    });
    await client.connect();

    await client.end();
  });

  test("delete", async () => {
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const newRolePwd = "rolepwd";
    const newRoleName = "myuser";
    await createRole({
      client: masterClient,
      name: newRoleName,
      password: newRolePwd,
    });

    const event: DeleteRoleEvent = {
      RequestType: "Delete",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newRoleName,
        PasswordArn: "", // can be empty for tests
      },
    };

    await roleHandler(event);

    expect(await roleExists(masterClient, newRoleName)).toEqual(false);

    await masterClient.end();
  });

  test("update", async () => {
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const roleName = "myuser";
    const rolePwd = "rolepwd";
    await createRole({
      client: masterClient,
      name: roleName,
      password: rolePwd,
    });

    const updatedRoleName = roleName + "updated";
    const updatedRolePwd = rolePwd + "updated";

    const updatedRolePwdArn = await createSecret(secretsmanager, updatedRolePwd);

    const event: UpdateRoleEvent = {
      RequestType: "Update",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: updatedRoleName,
        PasswordArn: updatedRolePwdArn,
      },
      OldResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: roleName,
        PasswordArn: "", // can be empty for tests
      },
    };

    await roleHandler(event);

    // try connecting as the updated role
    const client = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: updatedRoleName,
      password: updatedRolePwd,
    });
    await client.connect();

    await client.end();
    await masterClient.end();
  });

  test("passwordfield", async () => {
    const newRolePwd = "rolepwd";
    const masterpassword = "masterpwd";
    const passwordField = "myfield";

    // the master password is in a secret object
    const masterPasswordArn = await createSecret(
      secretsmanager,
      JSON.stringify({
        [passwordField]: masterpassword,
      }),
    );

    const rolePasswordArn = await createSecret(secretsmanager, newRolePwd);

    const newRoleName = "myuser";

    const event: CreateRoleEvent = {
      RequestType: "Create",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          PasswordField: passwordField,
          SSLMode: "disable",
        },
        Name: newRoleName,
        PasswordArn: rolePasswordArn,
      },
    };

    await roleHandler(event);

    // try connecting as the new role
    const client = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: newRoleName,
      password: newRolePwd,
    });
    await client.connect();

    await client.end();
  });
});

describe("database", () => {
  test("create", async () => {
    const newDbName = "mydb";

    const event: CreateDatabaseEvent = {
      RequestType: "Create",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newDbName,
        Owner: "postgres",
      },
    };
    await dbHandler(event);

    const client = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await client.connect();

    expect(await dbExists(client, newDbName)).toEqual(true);

    await client.end();
  });

  test("delete", async () => {
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const newDbName = "mydb";
    await createDatabase({
      client: masterClient,
      name: newDbName,
      owner: "postgres",
    });

    const event: DeleteDatabaseEvent = {
      RequestType: "Delete",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newDbName,
        Owner: "postgres",
      },
    };

    await dbHandler(event);

    console.log("checking if db exists");
    expect(await dbExists(masterClient, newDbName)).toEqual(false);
    await masterClient.end();
  });

  test("update db owner", async () => {
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const newDbName = "mydb";
    const newDbRole = "myrole";
    const updatedDbRole = newDbRole + "updated";

    await createRole({
      client: masterClient,
      name: newDbRole,
      password: "12345",
    });

    await createRole({
      client: masterClient,
      name: updatedDbRole,
      password: "12345",
    });

    await createDatabase({
      client: masterClient,
      name: newDbName,
      owner: newDbRole,
    });

    const event: UpdateDatabaseEvent = {
      RequestType: "Update",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newDbName,
        Owner: updatedDbRole,
      },
      OldResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newDbName,
        Owner: newDbRole,
      },
    };

    await dbHandler(event);

    expect(await getDbOwner(masterClient, newDbName)).toEqual(updatedDbRole);
    await masterClient.end();
  });
});

describe("role membership", () => {
  test("grants the membership on create and revokes it on delete", async () => {
    // Arrange
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const grantedRole = "replicator";
    const memberRole = "myuser";
    await createRole({ client: masterClient, name: grantedRole, password: "rolepwd" });
    await createRole({ client: masterClient, name: memberRole, password: "rolepwd" });

    const baseEvent = {
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "Custom::Postgresql-RoleMembership",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Role: grantedRole,
        Member: memberRole,
      },
    };

    // Act
    await roleMembershipHandler({ ...baseEvent, RequestType: "Create" });

    // Assert
    expect(
      await isMemberOf({ client: masterClient, member: memberRole, role: grantedRole })
    ).toEqual(true);

    // Act
    await roleMembershipHandler({ ...baseEvent, RequestType: "Delete" });

    // Assert
    expect(
      await isMemberOf({ client: masterClient, member: memberRole, role: grantedRole })
    ).toEqual(false);
    await masterClient.end();
  });

  test("grants the new membership when the role changes", async () => {
    // Arrange
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const oldRole = "replicator";
    const newRole = "monitor";
    const memberRole = "myuser";
    await createRole({ client: masterClient, name: oldRole, password: "rolepwd" });
    await createRole({ client: masterClient, name: newRole, password: "rolepwd" });
    await createRole({ client: masterClient, name: memberRole, password: "rolepwd" });

    const connection = {
      Host: pgHost,
      Port: pgPort,
      Username: DB_MASTER_USERNAME,
      Database: DB_DEFAULT_DB,
      PasswordArn: masterPasswordArn,
      SSLMode: "disable" as const,
    };
    const baseEvent = {
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "Custom::Postgresql-RoleMembership",
      ResourceProperties: {
        ServiceToken: "",
        Connection: connection,
        Role: oldRole,
        Member: memberRole,
      },
    };
    const createResponse = await roleMembershipHandler({
      ...baseEvent,
      RequestType: "Create",
    });
    const physicalResourceId = (createResponse as { PhysicalResourceId: string })
      .PhysicalResourceId;

    // Act
    const updateResponse = await roleMembershipHandler({
      ...baseEvent,
      RequestType: "Update",
      PhysicalResourceId: physicalResourceId,
      OldResourceProperties: baseEvent.ResourceProperties,
      ResourceProperties: { ...baseEvent.ResourceProperties, Role: newRole },
    });

    // Assert: a changed physical id is what makes CloudFormation treat the
    //         update as a replacement and send a delete for the old membership
    expect(await isMemberOf({ client: masterClient, member: memberRole, role: newRole })).toEqual(
      true
    );
    expect((updateResponse as { PhysicalResourceId: string }).PhysicalResourceId).not.toEqual(
      physicalResourceId
    );
    await masterClient.end();
  });
});

// The built asset is what actually gets deployed, and bundling can break it in
// ways the source cannot reproduce, so it gets exercised the way the lambda
// runtime loads it:
describe("built lambda asset", () => {
  test("creates a working role", async () => {
    // Arrange
    const roleName = "assetuser";
    const rolePwd = "assetrolepwd";
    const rolePasswordArn = await createSecret(secretsmanager, rolePwd);
    const event: CreateRoleEvent = {
      RequestType: "Create",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      ResourceType: "Custom::Postgresql-Role",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: roleName,
        PasswordArn: rolePasswordArn,
      },
    };

    // Act
    const { handler } = createRequire(import.meta.url)("../dist/lambda/index.cjs");
    await handler(event);

    // Assert
    const asNewRole = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: roleName,
      password: rolePwd,
    });
    await asNewRole.connect();
    const { rows } = await asNewRole.query("SELECT current_user");
    await asNewRole.end();
    expect(rows[0].current_user).toEqual(roleName);
  });
});
