import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import { Client, ClientConfig } from "pg";
import { Connection } from "./lambda.types";

export const secretsmanager = new SecretsManager({});

export const isObject = (obj: any): obj is { [key: string]: any } => {
  return typeof obj === "object" && !Array.isArray(obj) && obj !== null;
};

const MAX_RETRIES = 12;
const RETRY_DELAY_MS = 5000;

export const getConnectedClient = async (connection: Connection) => {
  console.debug(
    `creating PG client with connection: ${JSON.stringify(connection)}`
  );

  const password = await getPassword(connection);

  const clientProps: ClientConfig = {
    host: connection.Host,
    port: connection.Port,
    user: connection.Username,
    password,
    database: connection.Database,
  };

  if (connection.SSLMode === "require") {
    clientProps.ssl = {
      rejectUnauthorized: false,
    };
  }

  let client;
  let lastError: unknown;
  for (let tries = 1; tries <= MAX_RETRIES; tries++) {
    client = new Client(clientProps);
    try {
      await client.connect();
      console.debug("connected");
      return client;
    } catch (err) {
      lastError = err;
      console.debug({ err, tries, maxRetries: MAX_RETRIES });
      try { await client.end(); } catch { /* ignore cleanup errors */ }
      if (tries < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  throw new Error(
    `Failed to connect to PostgreSQL after ${MAX_RETRIES} attempts: ${lastError}`
  );
};

const getPassword = async (connection: Connection) => {
  const { SecretString } = await secretsmanager.getSecretValue({
    SecretId: connection.PasswordArn,
  });
  if (!SecretString) {
    throw new Error(`cannot find secret with arn ${connection.PasswordArn}`);
  }

  let parsedSecret;
  try {
    parsedSecret = JSON.parse(SecretString);
  } catch (e) {
    parsedSecret = SecretString;
  }

  let password;
  if (isObject(parsedSecret)) {
    if (!connection.PasswordField) {
      throw new Error(
        "connection.PasswordField must be specified if secret is object"
      );
    }
    if (!parsedSecret[connection.PasswordField]) {
      throw new Error(
        `PasswordField ${connection.PasswordField} was not found in secret`
      );
    }

    password = parsedSecret[connection.PasswordField];
  } else {
    password = parsedSecret;
  }

  return password;
};

export const validateConnection = (connection: Connection) => {
  if (!("Host" in connection)) {
    throw "Connection.Host property is required";
  }
  if (!("Port" in connection)) {
    throw "Connection.Port property is required";
  }
  if (!("Database" in connection)) {
    throw "Connection.Database property is required";
  }
  if (!("Username" in connection)) {
    throw "Connection.Username property is required";
  }
  if (!("PasswordArn" in connection)) {
    throw "Connection.PasswordArn property is required";
  }
};

export const hashCode = (str: string) => {
  var hash = 0,
    i,
    chr;
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`The environment variable "${name}" is not defined`);
  }
  return value;
}

export function log(title: any, ...args: any[]) {
  console.log(
    "[cdk-postgresql]",
    title,
    ...args.map((x) =>
      typeof x === "object" ? JSON.stringify(x, undefined, 2) : x
    )
  );
}
