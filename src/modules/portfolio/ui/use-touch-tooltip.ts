"use client";

import { useCallback, useEffect, useRef, type TouchEvent } from "react";


// Dismiss tooltips when their touch interaction ends.
const RELEASE_DELAYS_MS = [0, 80, 320];

export function useTouchTooltip() {
  const timers = useRef<number[]>([]);
  const lastTouch = useRef(0);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const release = useCallback((event: TouchEvent<HTMLElement>) => {
    const container = event.currentTarget;
    lastTouch.current = Date.now();
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = RELEASE_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        for (const wrapper of container.querySelectorAll(".recharts-wrapper")) {
          wrapper.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
        }
      }, delay),
    );
  }, []);

  const hold = useCallback(() => {
    lastTouch.current = Date.now();
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);


  const isTouch = useCallback(() => Date.now() - lastTouch.current < 800, []);

  return { containerProps: { onTouchStart: hold, onTouchEnd: release, onTouchCancel: release }, isTouch };
}
