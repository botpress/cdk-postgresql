# cdk-postgresql

[AWS CDK](https://github.com/aws/aws-cdk) constructs for Postgresql

## Installation

`npm install @botpress/cdk-postgresql` or `yarn add @botpress/cdk-postgresql`

## Usage

### Provider

A `Provider` instance is required in order to establish a connection to your Postgresql instance

```typescript
const theMasterSecret: secretsmanager.ISecret;

// you can connect to to a publicly available instance
const provider = new Provider(this, "Provider", {
  host: "your.db.host.net",
  username: "master",
  password: theMasterSecret,
  port: 5432,
  vpc,
  securityGroups: [dbClusterSecurityGroup],
});

// or a private instance in your VPC
const provider = new Provider(this, "Provider", {
  host: "your.db.host.net",
  username: "master",
  password: theMasterSecret,
  port: 5432,
  vpc,
  securityGroups: [yourDatabaseSecurityGroup],
});
```

You can reuse the same `Provider` instance when creating your different `Role` and `Database` instances.

### Database

```typescript
import { Database } from "@botpress/cdk-postgresql";

const db = new Database(this, "Database", {
  provider,
  name: "mynewdb",
  owner: "somerole",
  removalPolicy: cdk.RemovalPolicy.RETAIN, // default is RETAIN
});
```

### Role

```typescript
import { Role } from "@botpress/cdk-postgresql";

const rolePassword: secretsmanager.ISecret;
const role = new Role(this, "Role", {
  provider,
  name: "newrole",
  password: rolePassword,
  removalPolicy: cdk.RemovalPolicy.RETAIN, // Default is DESTROY
});
```

## Tips

### Creating a `Role` before a `Database`

In many cases, you want to create a `Role` and use that role as the `Database` owner. You can achieve this by adding an [explicit dependency](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib-readme.html#dependencies) between the two instances:

```typescript
const roleName = "newRole";
const role = new Role(this, "Role", {
  provider,
  name: roleName,
  password: rolePassword,
});
const db = new Database(this, "Database", {
  provider,
  name: "mydb",
  owner: roleName,
});

db.node.addDependency(role);
```
