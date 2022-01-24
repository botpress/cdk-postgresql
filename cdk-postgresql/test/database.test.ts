import { CloudFormationCustomResourceEvent } from "aws-lambda";
import { handler } from "../lib/database.handler";
import { GenericContainer, StartedTestContainer } from "testcontainers";
import ms from "ms";

describe("database", () => {
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await new GenericContainer("postgres")
      .withExposedPorts(5432)
      .withEnv("POSTGRES_PASSWORD", "postgres")
      .start();
  }, ms("2m"));

  afterAll(async () => {
    await container.stop();
  });

  test("something", async () => {
    console.log({ handler });
    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: { Host: container.getHost() },
      },
    };
    await handler(event);
  });
});
