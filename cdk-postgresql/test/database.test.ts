import { handler } from "../lib/lambda/lib/database";

test("something", async () => {
  console.log({ handler });
  const event = {};
  // @ts-ignore
  await handler(event);
});
