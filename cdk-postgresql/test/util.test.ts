import { isObject } from "../lib/util";

describe("isObject", () => {
  test("obj", () => {
    expect(isObject({})).toEqual(true);
    expect(isObject({ a: 1 })).toEqual(true);
    expect(isObject("something")).toEqual(false);
    expect(isObject(null)).toEqual(false);
  });
});
