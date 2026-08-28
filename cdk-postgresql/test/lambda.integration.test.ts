import { handler as dbHandler } from "../lib/database.handler";
import { handler as roleHandler } from "../lib/role.handler";
import ms from "ms";
import {
  CreateDatabaseEvent,
  CreateRoleEvent,
  DeleteDatabaseEvent,
  DeleteRoleEvent,
  UpdateDatabaseEvent,
  UpdateRoleEvent,
} from "../lib/lambda.types";
import { Client } from "pg";
import { createDatabase, createRole } from "../lib/postgres";
import { handler as roleMembershipHandler } from "../lib/role-membership.handler";
import { handler as replicationSlotHandler } from "../lib/replication-slot.handler";
import { CloudFormationCustomResourceEvent } from "aws-lambda/trigger/cloudformation-custom-resource";
import {
  createSecret,
  dbExists,
  getDbOwner,
  isMemberOf,
  replicationSlotExists,
  roleExists,
} from "./helpers";
import { secretsmanager } from "../lib/util";
import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { Server } from "node:http";
import {
  SECRETS_MANAGER_ENDPOINT,
  startFakeSecretsManager,
} from "./fixtures/fake-secrets-manager";
import {
  DB_DEFAULT_DB,
  DB_MASTER_PASSWORD,
  DB_MASTER_USERNAME,
  PostgresCluster,
  startPostgresCluster,
} from "./fixtures/postgres-cluster";

let cluster: PostgresCluster;
let secretsManagerServer: Server;
let masterPasswordArn: string;
let pgHost: string;
let pgPort: number;

beforeAll(async () => {
  [cluster, secretsManagerServer] = await Promise.all([
    startPostgresCluster(),
    startFakeSecretsManager(),
  ]);

  pgHost = cluster.host;
  pgPort = cluster.port;

  vi.stubEnv("AWS_ENDPOINT_URL", SECRETS_MANAGER_ENDPOINT);
  masterPasswordArn = await createSecret(secretsmanager, DB_MASTER_PASSWORD);
}, ms("2m"));

afterAll(async () => {
  vi.unstubAllEnvs();

  if (secretsManagerServer) {
    await new Promise<void>((resolve, reject) => {
      secretsManagerServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await cluster?.stop();
});

// The database container is shared by every test in this file, so each test
// starts from a blank cluster:
beforeEach(() => cluster.reset());

describe("role", () => {
  test("create", async () => {
    const newRolePwd = "rolepwd";
    const rolePasswordArn = await createSecret(secretsmanager, newRolePwd);

    const newRoleName = "myuser";

    const event: CreateRoleEvent = {
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
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newRoleName,
        PasswordArn: rolePasswordArn,
      },
    };

    await roleHandler(event);

    // try connecting as the new role
    const client = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: newRoleName,
      password: newRolePwd,
    });
    await client.connect();

    await client.end();
  });

  test("delete", async () => {
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const newRolePwd = "rolepwd";
    const newRoleName = "myuser";
    await createRole({
      client: masterClient,
      name: newRoleName,
      password: newRolePwd,
    });

    const event: DeleteRoleEvent = {
      RequestType: "Delete",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newRoleName,
        PasswordArn: "", // can be empty for tests
      },
    };

    await roleHandler(event);

    expect(await roleExists(masterClient, newRoleName)).toEqual(false);

    await masterClient.end();
  });

  test("update", async () => {
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const roleName = "myuser";
    const rolePwd = "rolepwd";
    await createRole({
      client: masterClient,
      name: roleName,
      password: rolePwd,
    });

    const updatedRoleName = roleName + "updated";
    const updatedRolePwd = rolePwd + "updated";

    const updatedRolePwdArn = await createSecret(secretsmanager, updatedRolePwd);

    const event: UpdateRoleEvent = {
      RequestType: "Update",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: updatedRoleName,
        PasswordArn: updatedRolePwdArn,
      },
      OldResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: roleName,
        PasswordArn: "", // can be empty for tests
      },
    };

    await roleHandler(event);

    // try connecting as the updated role
    const client = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: updatedRoleName,
      password: updatedRolePwd,
    });
    await client.connect();

    await client.end();
    await masterClient.end();
  });

  test("passwordfield", async () => {
    const newRolePwd = "rolepwd";
    const masterpassword = "masterpwd";
    const passwordField = "myfield";

    // the master password is in a secret object
    const masterPasswordArn = await createSecret(
      secretsmanager,
      JSON.stringify({
        [passwordField]: masterpassword,
      }),
    );

    const rolePasswordArn = await createSecret(secretsmanager, newRolePwd);

    const newRoleName = "myuser";

    const event: CreateRoleEvent = {
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
          PasswordArn: masterPasswordArn,
          PasswordField: passwordField,
          SSLMode: "disable",
        },
        Name: newRoleName,
        PasswordArn: rolePasswordArn,
      },
    };

    await roleHandler(event);

    // try connecting as the new role
    const client = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: newRoleName,
      password: newRolePwd,
    });
    await client.connect();

    await client.end();
  });
});

describe("database", () => {
  test("create", async () => {
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
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newDbName,
        Owner: "postgres",
      },
    };
    await dbHandler(event);

    const client = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await client.connect();

    expect(await dbExists(client, newDbName)).toEqual(true);

    await client.end();
  });

  test("delete", async () => {
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const newDbName = "mydb";
    await createDatabase({
      client: masterClient,
      name: newDbName,
      owner: "postgres",
    });

    const event: DeleteDatabaseEvent = {
      RequestType: "Delete",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newDbName,
        Owner: "postgres",
      },
    };

    await dbHandler(event);

    console.log("checking if db exists");
    expect(await dbExists(masterClient, newDbName)).toEqual(false);
    await masterClient.end();
  });

  test("update db owner", async () => {
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const newDbName = "mydb";
    const newDbRole = "myrole";
    const updatedDbRole = newDbRole + "updated";

    await createRole({
      client: masterClient,
      name: newDbRole,
      password: "12345",
    });

    await createRole({
      client: masterClient,
      name: updatedDbRole,
      password: "12345",
    });

    await createDatabase({
      client: masterClient,
      name: newDbName,
      owner: newDbRole,
    });

    const event: UpdateDatabaseEvent = {
      RequestType: "Update",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newDbName,
        Owner: updatedDbRole,
      },
      OldResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: newDbName,
        Owner: newDbRole,
      },
    };

    await dbHandler(event);

    expect(await getDbOwner(masterClient, newDbName)).toEqual(updatedDbRole);
    await masterClient.end();
  });
});

describe("role membership", () => {
  test("grants the membership on create and revokes it on delete", async () => {
    // Arrange
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const grantedRole = "replicator";
    const memberRole = "myuser";
    await createRole({ client: masterClient, name: grantedRole, password: "rolepwd" });
    await createRole({ client: masterClient, name: memberRole, password: "rolepwd" });

    const baseEvent = {
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "Custom::Postgresql-RoleMembership",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Role: grantedRole,
        Member: memberRole,
      },
    };

    // Act
    await roleMembershipHandler({ ...baseEvent, RequestType: "Create" });

    // Assert
    expect(
      await isMemberOf({ client: masterClient, member: memberRole, role: grantedRole })
    ).toEqual(true);

    // Act
    await roleMembershipHandler({ ...baseEvent, RequestType: "Delete" });

    // Assert
    expect(
      await isMemberOf({ client: masterClient, member: memberRole, role: grantedRole })
    ).toEqual(false);
    await masterClient.end();
  });

  test("succeeds on delete when the role has already been dropped", async () => {
    // Arrange
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const grantedRole = "replicator";
    const memberRole = "myuser";
    await createRole({ client: masterClient, name: grantedRole, password: "rolepwd" });
    await createRole({ client: masterClient, name: memberRole, password: "rolepwd" });

    const baseEvent = {
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "Custom::Postgresql-RoleMembership",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Role: grantedRole,
        Member: memberRole,
      },
    };
    await roleMembershipHandler({ ...baseEvent, RequestType: "Create" });

    // Dropping the role revokes the membership with it, which is the state a
    // stack teardown leaves behind when the role is deleted first:
    await masterClient.query(`DROP ROLE ${grantedRole}`);

    // Act
    const deleteMembership = () =>
      roleMembershipHandler({ ...baseEvent, RequestType: "Delete" });

    // Assert
    await expect(deleteMembership()).resolves.toEqual({});
    await masterClient.end();
  });

  test("grants the new membership when the role changes", async () => {
    // Arrange
    const masterClient = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
    });
    await masterClient.connect();

    const oldRole = "replicator";
    const newRole = "monitor";
    const memberRole = "myuser";
    await createRole({ client: masterClient, name: oldRole, password: "rolepwd" });
    await createRole({ client: masterClient, name: newRole, password: "rolepwd" });
    await createRole({ client: masterClient, name: memberRole, password: "rolepwd" });

    const connection = {
      Host: pgHost,
      Port: pgPort,
      Username: DB_MASTER_USERNAME,
      Database: DB_DEFAULT_DB,
      PasswordArn: masterPasswordArn,
      SSLMode: "disable" as const,
    };
    const baseEvent = {
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      PhysicalResourceId: "",
      ResourceType: "Custom::Postgresql-RoleMembership",
      ResourceProperties: {
        ServiceToken: "",
        Connection: connection,
        Role: oldRole,
        Member: memberRole,
      },
    };
    const createResponse = await roleMembershipHandler({
      ...baseEvent,
      RequestType: "Create",
    });
    const physicalResourceId = (createResponse as { PhysicalResourceId: string })
      .PhysicalResourceId;

    // Act
    const updateResponse = await roleMembershipHandler({
      ...baseEvent,
      RequestType: "Update",
      PhysicalResourceId: physicalResourceId,
      OldResourceProperties: baseEvent.ResourceProperties,
      ResourceProperties: { ...baseEvent.ResourceProperties, Role: newRole },
    });

    // Assert: a changed physical id is what makes CloudFormation treat the
    //         update as a replacement and send a delete for the old membership
    expect(await isMemberOf({ client: masterClient, member: memberRole, role: newRole })).toEqual(
      true
    );
    expect((updateResponse as { PhysicalResourceId: string }).PhysicalResourceId).not.toEqual(
      physicalResourceId
    );
    await masterClient.end();
  });
});

// The built asset is what actually gets deployed, and bundling can break it in
// ways the source cannot reproduce, so it gets exercised the way the lambda
// runtime loads it:
describe("built lambda asset", () => {
  test("creates a working role", async () => {
    // Arrange
    const roleName = "assetuser";
    const rolePwd = "assetrolepwd";
    const rolePasswordArn = await createSecret(secretsmanager, rolePwd);
    const event: CreateRoleEvent = {
      RequestType: "Create",
      ServiceToken: "",
      ResponseURL: "",
      StackId: "",
      RequestId: "",
      LogicalResourceId: "",
      ResourceType: "Custom::Postgresql-Role",
      ResourceProperties: {
        ServiceToken: "",
        Connection: {
          Host: pgHost,
          Port: pgPort,
          Username: DB_MASTER_USERNAME,
          Database: DB_DEFAULT_DB,
          PasswordArn: masterPasswordArn,
          SSLMode: "disable",
        },
        Name: roleName,
        PasswordArn: rolePasswordArn,
      },
    };

    // Act
    const { handler } = createRequire(import.meta.url)("../dist/lambda/index.cjs");
    await handler(event);

    // Assert
    const asNewRole = new Client({
      host: pgHost,
      port: pgPort,
      database: DB_DEFAULT_DB,
      user: roleName,
      password: rolePwd,
    });
    await asNewRole.connect();
    const { rows } = await asNewRole.query("SELECT current_user");
    await asNewRole.end();
    expect(rows[0].current_user).toEqual(roleName);
  });
});

describe("replication-slot handler", () => {
  const SLOT_NAME = "test_slot";
  const OTHER_DB = "other_db";
  const CREATED_PHYSICAL_ID = "replication-slot-1-created";
  const PHYSICAL_ID_WITHOUT_PROVENANCE = "replication-slot-1";

  const buildConnection = (database = DB_DEFAULT_DB) => ({
    Host: pgHost,
    Port: pgPort,
    Username: DB_MASTER_USERNAME,
    PasswordArn: masterPasswordArn,
    Database: database,
    SSLMode: "disable" as const,
  });

  const buildCreateEvent = (props?: { requiredPublication?: string }) =>
    ({
      RequestType: "Create",
      ResourceProperties: {
        ServiceToken: "token",
        Connection: buildConnection(),
        Name: SLOT_NAME,
        Plugin: "pgoutput",
        RequiredPublication: props?.requiredPublication,
      },
    }) as unknown as CloudFormationCustomResourceEvent;

  const buildUpdateEvent = (props: {
    physicalResourceId: string;
    name?: string;
    plugin?: string;
    database?: string;
  }) =>
    ({
      RequestType: "Update",
      PhysicalResourceId: props.physicalResourceId,
      ResourceProperties: {
        ServiceToken: "token",
        Connection: buildConnection(props.database),
        Name: props.name ?? SLOT_NAME,
        Plugin: props.plugin ?? "pgoutput",
      },
      OldResourceProperties: {
        ServiceToken: "token",
        Connection: buildConnection(),
        Name: SLOT_NAME,
        Plugin: "pgoutput",
      },
    }) as unknown as CloudFormationCustomResourceEvent;

  const buildDeleteEvent = (physicalResourceId: string) =>
    ({
      RequestType: "Delete",
      PhysicalResourceId: physicalResourceId,
      ResourceProperties: {
        ServiceToken: "token",
        Connection: buildConnection(),
        Name: SLOT_NAME,
        Plugin: "pgoutput",
      },
    }) as unknown as CloudFormationCustomResourceEvent;

  const createSlotAndReturnPhysicalId = async () => {
    const response = await replicationSlotHandler(buildCreateEvent());
    return (response as { PhysicalResourceId: string }).PhysicalResourceId;
  };

  const connectAs = async (database: string) => {
    const client = new Client({
      host: pgHost,
      port: pgPort,
      user: DB_MASTER_USERNAME,
      password: DB_MASTER_PASSWORD,
      database,
    });
    await client.connect();
    return client;
  };

  const connectAsMaster = () => connectAs(DB_DEFAULT_DB);

  test("creates the slot when it is absent", async () => {
    // Arrange
    const event = buildCreateEvent();

    // Act
    await replicationSlotHandler(event);

    // Assert
    const masterClient = await connectAsMaster();
    expect(await replicationSlotExists(masterClient, SLOT_NAME)).toBe(true);
    await masterClient.end();
  });

  test("leaves an existing slot in place", async () => {
    // Arrange
    await replicationSlotHandler(buildCreateEvent());

    // Act
    const response = await replicationSlotHandler(buildCreateEvent());

    // Assert
    expect(response).toEqual({
      PhysicalResourceId: expect.stringContaining("replication-slot-"),
    });
  });

  test("refuses to create the slot while the required publication is absent", async () => {
    // Act
    const createSlot = () =>
      replicationSlotHandler(
        buildCreateEvent({ requiredPublication: "missing_pub" })
      );

    // Assert
    await expect(createSlot()).rejects.toThrow(
      /publication "missing_pub" does not exist/
    );
  });

  test("creates the slot once the required publication exists", async () => {
    // Arrange
    const masterClient = await connectAsMaster();
    await masterClient.query("CREATE TABLE outbox (id int primary key)");
    await masterClient.query(
      "CREATE PUBLICATION required_pub FOR TABLE outbox WITH (publish = 'insert')"
    );

    // Act
    await replicationSlotHandler(
      buildCreateEvent({ requiredPublication: "required_pub" })
    );

    // Assert
    expect(await replicationSlotExists(masterClient, SLOT_NAME)).toBe(true);
    await masterClient.end();
  });

  test("drops the slot on delete", async () => {
    // Arrange
    const physicalResourceId = await createSlotAndReturnPhysicalId();

    // Act
    await replicationSlotHandler(buildDeleteEvent(physicalResourceId));

    // Assert
    const masterClient = await connectAsMaster();
    expect(await replicationSlotExists(masterClient, SLOT_NAME)).toBe(false);
    await masterClient.end();
  });

  test("refuses to change the plugin of an existing slot", async () => {
    // Arrange
    const physicalResourceId = await createSlotAndReturnPhysicalId();

    // Act
    const changePlugin = () =>
      replicationSlotHandler(
        buildUpdateEvent({ physicalResourceId, plugin: "test_decoding" })
      );

    // Assert
    await expect(changePlugin()).rejects.toThrow(/cannot change in place/);
  });

  test("creates the new slot when the name changes", async () => {
    // Arrange
    const physicalResourceId = await createSlotAndReturnPhysicalId();
    const renamedSlot = "test_slot_renamed";

    // Act
    const updateResponse = await replicationSlotHandler(
      buildUpdateEvent({ physicalResourceId, name: renamedSlot })
    );

    // Assert: a changed physical id is what makes CloudFormation delete the
    //         resource holding the old slot after the new one is created
    expect(
      (updateResponse as { PhysicalResourceId: string }).PhysicalResourceId
    ).not.toEqual(physicalResourceId);
    const masterClient = await connectAsMaster();
    expect(await replicationSlotExists(masterClient, renamedSlot)).toBe(true);
    await masterClient.end();
  });

  test("refuses to adopt an existing slot created with another plugin", async () => {
    // Arrange
    const masterClient = await connectAsMaster();
    await masterClient.query(
      "SELECT pg_create_logical_replication_slot($1, $2)",
      [SLOT_NAME, "test_decoding"]
    );

    // Act
    const adoptSlot = () => replicationSlotHandler(buildCreateEvent());

    // Assert
    await expect(adoptSlot()).rejects.toThrow(
      /already exists in database "postgres" with plugin "test_decoding"/
    );
    await masterClient.end();
  });

  test("refuses to move an existing slot to another database", async () => {
    // Arrange
    const masterClient = await connectAsMaster();
    await masterClient.query(`CREATE DATABASE ${OTHER_DB}`);
    const physicalResourceId = await createSlotAndReturnPhysicalId();

    // Act
    const moveSlot = () =>
      replicationSlotHandler(
        buildUpdateEvent({ physicalResourceId, database: OTHER_DB })
      );

    // Assert: a slot name is unique across the cluster, so failing to create
    //         the replacement is what proves the changed database produced a
    //         new physical id instead of the update silently reporting success
    await expect(moveSlot()).rejects.toThrow(
      /replication slot "test_slot" already exists/
    );
    await masterClient.end();
  });

  test("leaves a slot decoding another database in place on delete", async () => {
    // Arrange
    const masterClient = await connectAsMaster();
    await masterClient.query(`CREATE DATABASE ${OTHER_DB}`);
    const otherClient = await connectAs(OTHER_DB);
    await otherClient.query("SELECT pg_create_logical_replication_slot($1, $2)", [
      SLOT_NAME,
      "pgoutput",
    ]);

    // Act
    await replicationSlotHandler(buildDeleteEvent(CREATED_PHYSICAL_ID));

    // Assert
    expect(await replicationSlotExists(otherClient, SLOT_NAME)).toBe(true);
    await otherClient.end();
    await masterClient.end();
  });

  test("leaves an adopted slot in place on delete", async () => {
    // Arrange
    const masterClient = await connectAsMaster();
    await masterClient.query(
      "SELECT pg_create_logical_replication_slot($1, $2)",
      [SLOT_NAME, "pgoutput"]
    );

    // Act
    const physicalResourceId = await createSlotAndReturnPhysicalId();
    await replicationSlotHandler(buildDeleteEvent(physicalResourceId));

    // Assert
    expect(physicalResourceId).toMatch(/-adopted$/);
    expect(await replicationSlotExists(masterClient, SLOT_NAME)).toBe(true);
    await masterClient.end();
  });

  test("leaves the slot in place when the physical id carries no provenance", async () => {
    // Arrange
    const masterClient = await connectAsMaster();
    await masterClient.query(
      "SELECT pg_create_logical_replication_slot($1, $2)",
      [SLOT_NAME, "pgoutput"]
    );

    // Act
    await replicationSlotHandler(
      buildDeleteEvent(PHYSICAL_ID_WITHOUT_PROVENANCE)
    );

    // Assert: rollback of a failed create deletes under a generated token, and
    //         a create fails precisely when a slot it never created is already
    //         there, so an id without provenance must never drop
    expect(await replicationSlotExists(masterClient, SLOT_NAME)).toBe(true);
    await masterClient.end();
  });

  test("keeps the physical id when an adopted slot is updated with no change", async () => {
    // Arrange
    const masterClient = await connectAsMaster();
    await masterClient.query(
      "SELECT pg_create_logical_replication_slot($1, $2)",
      [SLOT_NAME, "pgoutput"]
    );
    const physicalResourceId = await createSlotAndReturnPhysicalId();

    // Act
    const updateResponse = await replicationSlotHandler(
      buildUpdateEvent({ physicalResourceId })
    );

    // Assert
    expect(
      (updateResponse as { PhysicalResourceId: string }).PhysicalResourceId
    ).toEqual(physicalResourceId);
    await masterClient.end();
  });
});
