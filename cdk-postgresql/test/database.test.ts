import { handler } from "../lib/database.handler";
const utilModule = require("../lib/util");
import { GenericContainer, StartedTestContainer } from "testcontainers";
import ms from "ms";
import { CreateDatabaseEvent } from "../lib/lambda.types";
import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";

const DB_PORT = 5432;
const DB_MASTER_USERNAME = "postgres";
const DB_MASTER_PASSWORD = "masterpwd";
const DB_DEFAULT_DB = "postgres";

describe("database", () => {
  let pgContainer: StartedTestContainer;
  let localstackContainer: StartedTestContainer;

  beforeAll(async () => {
    pgContainer = await new GenericContainer("postgres")
      .withExposedPorts(DB_PORT)
      .withEnv("POSTGRES_PASSWORD", DB_MASTER_PASSWORD)
      .start();
    localstackContainer = await new GenericContainer("localstack/localstack")
      .withEnv("SERVICES", "secretsmanager")
      .withExposedPorts(4566)
      .start();
  }, ms("2m"));

  afterAll(async () => {
    await pgContainer.stop();
    await localstackContainer.stop();
  });

  test(
    "create",
    async () => {
      const endpoint = `http://localhost:${localstackContainer.getMappedPort(
        4566
      )}`;
      const secretsManager = new SecretsManager({
        endpoint,
      });
      utilModule.secretsmanager = secretsManager;
      const { ARN } = await secretsManager.createSecret({
        SecretString: DB_MASTER_PASSWORD,
        Name: "/db/masterpwd",
      });
      if (!ARN) {
        throw "ARN undefined";
      }

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
            PasswordArn: ARN,
            SSLMode: "disable",
          },
          Name: newDbName,
          Owner: "postgres",
        },
      };
      await handler(event);

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
    },
    ms("10m")
  );
});
