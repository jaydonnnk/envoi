import { describe, expect, it } from "vitest";
import { focusAfterAction } from "@/lib/browser/focus";

const body = { name: "body" };
const button = { focus: () => {} };
const elsewhere = { name: "another control" };

describe("focus returns to the button after its action", () => {
  it("returns focus to the button when the action ends with focus on the page body", () => {
    expect(focusAfterAction(true, false, body, body, button)).toBe(button);
  });

  it("returns focus to the button when the action ends with no focused element", () => {
    expect(focusAfterAction(true, false, null, body, button)).toBe(button);
  });

  it("leaves focus the user moved to another control", () => {
    expect(focusAfterAction(true, false, elsewhere, body, button)).toBeNull();
  });

  it("does nothing while the action is still running", () => {
    expect(focusAfterAction(true, true, body, body, button)).toBeNull();
  });

  it("does nothing when no action ran", () => {
    expect(focusAfterAction(false, false, body, body, button)).toBeNull();
  });
});
