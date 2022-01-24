import { handler as dbHandler } from "../lib/database.handler";
import { handler as roleHandler, updateRoleName } from "../lib/role.handler";
const utilModule = require("../lib/util");
import { GenericContainer, StartedTestContainer } from "testcontainers";
import ms from "ms";
import {
  CreateDatabaseEvent,
  CreateRoleEvent,
  DeleteDatabaseEvent,
  DeleteRoleEvent,
  UpdateRoleEvent,
} from "../lib/lambda.types";
import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";
import { createDatabase, createRole } from "../lib/postgres";
import { createSecret, dbExists, roleExists } from "./helpers";
import { secretsmanager } from "../lib/util";

const DB_PORT = 5432;
const DB_MASTER_USERNAME = "postgres";
const DB_MASTER_PASSWORD = "masterpwd";
const DB_DEFAULT_DB = "postgres";

let pgContainer: StartedTestContainer;
let localstackContainer: StartedTestContainer;
let masterPasswordArn: string;
let secretsManager: SecretsManager;
let pgHost: string;
let pgPort: number;

beforeEach(async () => {
  pgContainer = await new GenericContainer("postgres")
    .withExposedPorts(DB_PORT)
    .withEnv("POSTGRES_PASSWORD", DB_MASTER_PASSWORD)
    .start();
  localstackContainer = await new GenericContainer("localstack/localstack")
    .withEnv("SERVICES", "secretsmanager")
    .withExposedPorts(4566)
    .start();

  pgHost = pgContainer.getHost();
  pgPort = pgContainer.getMappedPort(DB_PORT);

  secretsManager = new SecretsManager({
    endpoint: `http://localhost:${localstackContainer.getMappedPort(4566)}`,
  });
  utilModule.secretsmanager = secretsManager;
  masterPasswordArn = await createSecret(secretsmanager, DB_MASTER_PASSWORD);
}, ms("2m"));

afterEach(async () => {
  await pgContainer.stop();
  await localstackContainer.stop();
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

    // const rolePasswordArn = await createSecret(secretsManager, newRolePwd);

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

    const updatedRolePwdArn = await createSecret(
      secretsManager,
      updatedRolePwd
    );

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
});
