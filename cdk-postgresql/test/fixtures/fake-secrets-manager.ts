import { createServer, Server } from "node:http";

const SECRETS_MANAGER_PORT = 14566;
export const SECRETS_MANAGER_ENDPOINT = `http://localhost:${SECRETS_MANAGER_PORT}`;

/**
 * Serves the two Secrets Manager operations the lambda handlers call.
 */
export const startFakeSecretsManager = () => {
  const secretsByArn = new Map<string, string>();

  const server = createServer((request, response) => {
    let body = "";

    request.on("data", (chunk) => (body += chunk));

    request.on("end", () => {
      const operation = request.headers["x-amz-target"];
      const payload = JSON.parse(body);

      response.setHeader("content-type", "application/x-amz-json-1.1");

      if (operation === "secretsmanager.CreateSecret") {
        const arn = `arn:aws:secretsmanager:us-east-1:123456789012:secret:${payload.Name}`;
        secretsByArn.set(arn, payload.SecretString);
        response.end(JSON.stringify({ ARN: arn, Name: payload.Name }));
      } else if (operation === "secretsmanager.GetSecretValue") {
        const secretString = secretsByArn.get(payload.SecretId);
        if (secretString === undefined) {
          response.statusCode = 400;
          response.end(JSON.stringify({ __type: "ResourceNotFoundException" }));
        } else {
          response.end(JSON.stringify({ ARN: payload.SecretId, SecretString: secretString }));
        }
      } else {
        response.statusCode = 400;
        response.end(JSON.stringify({ __type: "UnknownOperationException" }));
      }
    });
  });

  return new Promise<Server>((resolve, reject) => {
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(server);
    };

    const onError = (error: Error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(SECRETS_MANAGER_PORT);
  });
};
