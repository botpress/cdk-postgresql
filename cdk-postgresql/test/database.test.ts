import { handler } from "../lib/database.handler";
const utilModule = require("../lib/util");
import { GenericContainer, StartedTestContainer } from "testcontainers";
import ms from "ms";
import { CreateDatabaseEvent } from "../lib/lambda.types";
import { SecretsManager } from "@aws-sdk/client-secrets-manager";

const DB_PORT = 5432;
const DB_MASTER_PASSWORD = "masterpwd";

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

  test("something", async () => {
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
          Host: pgContainer.getHost(),
          Port: pgContainer.getMappedPort(DB_PORT),
          Username: "postgres",
          Database: "postgres",
          PasswordArn: ARN,
          SSLMode: "disable",
        },
        Name: "mydb",
        Owner: "postgres",
      },
    };
    await handler(event);
  });
});
