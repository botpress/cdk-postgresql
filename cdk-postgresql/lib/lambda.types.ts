import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from "aws-lambda";

export interface Connection {
  Host: string;
  Port: number;
  Username: string;
  PasswordArn: string;
  PasswordField?: string;
  Database: string;
  SSLMode: "require" | "disable";
}

export interface CreateDatabaseEvent
  extends CloudFormationCustomResourceCreateEvent {
  ResourceProperties: {
    ServiceToken: string;
    Connection: Connection;
    Name: string;
    Owner: string;
  };
}

export interface CreateRoleEvent
  extends CloudFormationCustomResourceCreateEvent {
  ResourceProperties: {
    ServiceToken: string;
    Connection: Connection;
    Name: string;
    PasswordArn: string;
  };
}

export interface DeleteRoleEvent
  extends CloudFormationCustomResourceDeleteEvent {
  ResourceProperties: {
    ServiceToken: string;
    Connection: Connection;
    Name: string;
    PasswordArn: string;
  };
}
