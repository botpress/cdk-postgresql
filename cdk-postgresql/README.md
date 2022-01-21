# cdk-postgresql

[AWS CDK](https://github.com/aws/aws-cdk) constructs for Postgresql

## Installation

`npm install @botpress/cdk-postgresql`

## Usage

### Database

```typescript
import { Database } from "@botpress/cdk-postgresql";

const db = new Database(this, "DB", {
  connection: {
    host: "yourdb.somedomain.com",
    port: 5432,
    username: "master",
    password: "abcd1234",
  },
  name: "the_database_name",
  owner: "the_database_owner",
});
```

### Role

```typescript
import { Role } from "@botpress/cdk-postgresql";

const role = new Role(this, "DB", {
  connection: {
    host: "yourdb.somedomain.com",
    port: 5432,
    username: "master",
    password: "abcd1234",
  },
  name: "the_role_name",
  password: "the_role_password",
});
```

### VPC Access

You can connect to a PostpreSQL server inside a VPC:

```typescript
import { Database, Provider } from "@botpress/cdk-postgresql";

const provider = new Provider(this, "Provider", {
  vpc,
  securityGroups: [securityGroup],
});

const db = new Database(this, "DB", {
  connection: {
    host: "yourdb.somedomain.com",
    port: 5432,
    username: "master",
    password: "abcd1234",
    provider,
  },
  name: "the_database_name",
  owner: "the_database_owner",
});
```
