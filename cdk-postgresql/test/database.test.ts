import { handler } from "../lib/database.handler";

test("something", async () => {
  console.log({ handler });
  const event = {};
  // @ts-ignore
  await handler(event);
});
