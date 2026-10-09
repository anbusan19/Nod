import { describe, expect, it } from "vitest";
import { decidePushStatus } from "../status";

const base = { granted: true, canAskAgain: true, registeredServer: "https://a.example", currentServer: "https://a.example" };

describe("decidePushStatus", () => {
  it("is on when allowed and registered with the backend in use", () => {
    expect(decidePushStatus(base)).toBe("on");
  });
  it("is off when allowed but not yet registered with this backend (a new server needs its own registration)", () => {
    expect(decidePushStatus({ ...base, registeredServer: null })).toBe("off");
    expect(decidePushStatus({ ...base, currentServer: "https://b.example" })).toBe("off");
  });
  it("is off when permission has not been given yet, and blocked when Android will not ask again", () => {
    expect(decidePushStatus({ ...base, granted: false })).toBe("off");
    expect(decidePushStatus({ ...base, granted: false, canAskAgain: false })).toBe("blocked");
  });
});
