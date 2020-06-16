import { Client, ClientConfig } from "pg";

export interface ConnectionInfo {
  Host: string;
  Port: number;
  Username: string;
  Password: string;
  Database: string;
  SSLMode: "require" | "disable";
}

export const createClient = (connectionInfo: ConnectionInfo) => {
  const clientProps: ClientConfig = {
    host: connectionInfo.Host,
    port: connectionInfo.Port,
    user: connectionInfo.Username,
    password: connectionInfo.Password,
    database: connectionInfo.Database,
  };

  if (connectionInfo.SSLMode === "require") {
    clientProps.ssl = {
      rejectUnauthorized: false,
    };
  }

  return new Client(clientProps);
};

export const validateConnectionInfo = (connectionInfo: ConnectionInfo) => {
  if (!("Host" in connectionInfo)) {
    throw "ConnectionInfo.Host property is required";
  }
  if (!("Port" in connectionInfo)) {
    throw "ConnectionInfo.Port property is required";
  }
  if (!("Database" in connectionInfo)) {
    throw "ConnectionInfo.Database property is required";
  }
  if (!("Username" in connectionInfo)) {
    throw "ConnectionInfo.Username property is required";
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
