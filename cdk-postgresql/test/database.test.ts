import { handler } from "../lib/database.handler";
import { GenericContainer, StartedTestContainer } from "testcontainers";
import ms from "ms";
import { CreateDatabaseEvent } from "../lib/lambda.types";

const DB_PORT = 5432;

describe("database", () => {
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await new GenericContainer("postgres")
      .withExposedPorts(DB_PORT)
      .withEnv("POSTGRES_PASSWORD", "postgres")
      .start();
  }, ms("2m"));

  afterAll(async () => {
    await container.stop();
  });

  test("something", async () => {
    console.log({ handler });
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
          Host: container.getHost(),
          Port: container.getMappedPort(DB_PORT),
          Username: "postgres",
          Database: "postgres",
          PasswordArn: "asdf",
          SSLMode: "disable",
        },
        Name: "mydb",
        Owner: "postgres",
      },
    };
    await handler(event);
  });
});
