import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceUpdateEvent,
} from "aws-lambda";

export type SSLMode = "require" | "disable";

export interface Connection {
  Host: string;
  Port: number;
  Username: string;
  PasswordArn: string;
  PasswordField?: string;
  Database: string;
  SSLMode: SSLMode;
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

export interface DeleteDatabaseEvent
  extends CloudFormationCustomResourceDeleteEvent {
  ResourceProperties: {
    ServiceToken: string;
    Connection: Connection;
    Name: string;
    Owner: string;
  };
}

export interface UpdateDatabaseEvent
  extends CloudFormationCustomResourceUpdateEvent {
  ResourceProperties: {
    ServiceToken: string;
    Connection: Connection;
    Name: string;
    Owner: string;
  };
  OldResourceProperties: {
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

export interface UpdateRoleEvent
  extends CloudFormationCustomResourceUpdateEvent {
  ResourceProperties: {
    ServiceToken: string;
    Connection: Connection;
    Name: string;
    PasswordArn: string;
  };
  OldResourceProperties: {
    Connection: Connection;
    Name: string;
    PasswordArn: string;
  };
}
