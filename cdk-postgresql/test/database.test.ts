import { handler } from "../lib/database.handler";
const utilModule = require("../lib/util");
import { GenericContainer, StartedTestContainer } from "testcontainers";
import ms from "ms";
import { CreateDatabaseEvent } from "../lib/lambda.types";
import { SecretsManager } from "@aws-sdk/client-secrets-manager";

const DB_PORT = 5432;

describe("database", () => {
  let pgContainer: StartedTestContainer;
  let localstackContainer: StartedTestContainer;

  beforeAll(async () => {
    pgContainer = await new GenericContainer("postgres")
      .withExposedPorts(DB_PORT)
      .withEnv("POSTGRES_PASSWORD", "postgres")
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
    // process.env.TEST_AWS_ENDPOINT = endpoint;
    console.log({ endpoint });
    const secretsManager = new SecretsManager({
      endpoint,
    });
    console.log({ utilModule });
    utilModule.secretsmanager = secretsManager;
    console.log({ port: localstackContainer.getMappedPort(4566) });
    const { ARN } = await secretsManager.createSecret({
      SecretString: "hello",
      Name: "lol",
    });
    if (!ARN) {
      throw "ARN undefined";
    }

    console.log({ ARN });
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
