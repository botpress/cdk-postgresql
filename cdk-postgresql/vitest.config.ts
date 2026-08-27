import { defineConfig } from "vitest/config";

// Common excludes for all test projects:
const commonExcludes = [
  "**/fixtures/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/.{idea,git,cache,output,temp}/**",
  "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress}.config.*",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: [...commonExcludes, "test/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["test/**/*.integration.test.ts"],
          exclude: commonExcludes,
          testTimeout: 120_000,
          hookTimeout: 120_000,
          env: {
            AWS_REGION: "us-east-1",
            AWS_ACCESS_KEY_ID: "something",
            AWS_SECRET_ACCESS_KEY: "something",
          },
        },
      },
    ],
  },
});
