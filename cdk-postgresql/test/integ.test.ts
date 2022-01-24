import { handler as dbHandler } from "../lib/database.handler";
import { handler as roleHandler } from "../lib/role.handler";
const utilModule = require("../lib/util");
import { GenericContainer, StartedTestContainer } from "testcontainers";
import ms from "ms";
import { CreateDatabaseEvent, CreateRoleEvent } from "../lib/lambda.types";
import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";

const DB_PORT = 5432;
const DB_MASTER_USERNAME = "postgres";
const DB_MASTER_PASSWORD = "masterpwd";
const DB_DEFAULT_DB = "postgres";

let pgContainer: StartedTestContainer;
let localstackContainer: StartedTestContainer;
let masterPasswordArn: string;
let secretsManager: SecretsManager;

beforeAll(async () => {
  pgContainer = await new GenericContainer("postgres")
    .withExposedPorts(DB_PORT)
    .withEnv("POSTGRES_PASSWORD", DB_MASTER_PASSWORD)
    .start();
  localstackContainer = await new GenericContainer("localstack/localstack")
    .withEnv("SERVICES", "secretsmanager")
    .withExposedPorts(4566)
    .start();

  const endpoint = `http://localhost:${localstackContainer.getMappedPort(
    4566
  )}`;
  secretsManager = new SecretsManager({
    endpoint,
  });
  utilModule.secretsmanager = secretsManager;
  const response = await secretsManager.createSecret({
    SecretString: DB_MASTER_PASSWORD,
    Name: "/db/masterpwd",
  });
  if (!response.ARN) {
    throw "failed creating master password in SecretsManager";
  }
  masterPasswordArn = response.ARN;
}, ms("2m"));

afterAll(async () => {
  await pgContainer.stop();
  await localstackContainer.stop();
});

describe("role", () => {
  test("create", async () => {
    const newRolePwd = "rolepwd";
    const { ARN: rolePasswordArn } = await secretsManager.createSecret({
      SecretString: newRolePwd,
      Name: "/db/rolepwd",
    });
    if (!rolePasswordArn) {
      throw "rolePasswordArn undefined";
    }

    const pgHost = pgContainer.getHost();
    const pgPort = pgContainer.getMappedPort(DB_PORT);
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
});

describe("database", () => {
  test("create", async () => {
    const pgHost = pgContainer.getHost();
    const pgPort = pgContainer.getMappedPort(DB_PORT);
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

    console.debug("querying DB for results");
    const { rows } = await client.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false;`
    );
    await client.end();

    expect(rows.find((r) => r.datname === newDbName)).not.toBeUndefined();
  });
});
