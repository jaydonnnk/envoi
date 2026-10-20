// S15 keyboard check: a button disabled while its action runs drops keyboard focus to the page body,
// so after a refusal shown in place the next Tab starts again from the top of the page. When the
// action ends and focus is still nowhere, it goes back to the last button that had focus, which on a
// keyboard is the one that started the action. Only buttons are remembered, so focus never moves to
// a text field (which would open a phone's keyboard), and focus the user has moved elsewhere in the
// meantime is never taken.
import { useEffect, useRef } from "react";

type Focusable = { focus: () => void };

// The element to focus when an action's busy state changes, or null to leave focus alone.
export function focusAfterAction<T extends Focusable>(
  wasBusy: boolean,
  busy: boolean,
  active: unknown,
  body: unknown,
  lastButton: T | null,
): T | null {
  if (!wasBusy || busy) return null;
  if (active !== null && active !== body) return null;
  return lastButton;
}

let lastButton: HTMLButtonElement | null = null;
let listening = false;

function rememberButton(event: FocusEvent) {
  if (event.target instanceof HTMLButtonElement) lastButton = event.target;
}

export function useRestoreFocus(busy: boolean) {
  const wasBusy = useRef(false);
  useEffect(() => {
    if (listening) return;
    listening = true;
    document.addEventListener("focusin", rememberButton);
  }, []);
  useEffect(() => {
    focusAfterAction(wasBusy.current, busy, document.activeElement, document.body, lastButton)?.focus();
    wasBusy.current = busy;
  }, [busy]);
}
