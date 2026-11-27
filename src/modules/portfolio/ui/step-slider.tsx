"use client";

import { englishLabel } from "@/lib/english-labels";

import { Slider } from "@base-ui/react/slider";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { cn } from "@/lib/utils";


const SLIDER_STEP = 1;

const TOUCH_DRAG_THRESHOLD = 8;

const THUMB_TOUCH_SLOP = 12;

const KEY_DIRECTION: Partial<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  PageUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageDown: -1,
};


export function StepSlider({
  value,
  max,
  largeStep = 10,
  label,
  valueText,
  onChange,
}: {
  value: number;
  max: number;
  largeStep?: number;
  label: string;
  valueText: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const shown = Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  const rootRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const touchDragging = useTouchDrag({ rootRef, controlRef, thumbRef, value: shown, max, onChange });

  const stepFromFraction = (event: KeyboardEvent<HTMLInputElement>) => {
    const direction = KEY_DIRECTION[event.key];
    if (direction === undefined || Number.isInteger(shown)) {
      return;
    }
    const increment =
      event.shiftKey || event.key === "PageUp" || event.key === "PageDown" ? largeStep : SLIDER_STEP;
    event.preventDefault();
    onChange(wholeStepFrom(shown, direction * increment, max));
  };


  const stepNativeFromFraction = (event: FormEvent<HTMLDivElement>) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || Number.isInteger(shown)) {
      return;
    }
    event.stopPropagation();
    const direction = Math.sign(input.valueAsNumber - shown);
    if (direction === 1 || direction === -1) {
      onChange(wholeStepFrom(shown, direction * SLIDER_STEP, max));
    }
  };

  return (
    <Slider.Root
      ref={rootRef}
      value={shown}
      min={0}
      max={max}
      step={SLIDER_STEP}
      largeStep={largeStep}
      thumbAlignment="edge"
      onValueChange={(next) => {
        if (typeof next === "number") {
          onChange(next);
        }
      }}
      className="w-full"
    >
      <Slider.Control
        ref={controlRef}
        className="flex h-8 w-full cursor-pointer touch-pan-y items-center select-none"
      >
        <Slider.Track className="relative h-1.5 w-full rounded-full bg-white/[0.08]">
          <Slider.Indicator className="rounded-full bg-primary" />
          <Slider.Thumb
            ref={thumbRef}
            aria-label={englishLabel(label)}
            getAriaValueText={(_formatted, current) => valueText(current)}
            onKeyDown={stepFromFraction}
            onChangeCapture={stepNativeFromFraction}
            className={cn(
              "size-4 rounded-full border-[3px] border-card bg-primary shadow-[0_1px_3px_rgb(0_0_0/0.45)] outline-none transition-[box-shadow,scale] duration-150 ease-out select-none hover:ring-4 hover:ring-primary/15 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/45 data-dragging:scale-110 data-dragging:ring-4 data-dragging:ring-primary/20",
              touchDragging && "scale-110 ring-4 ring-primary/20",
            )}
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}


function useTouchDrag({
  rootRef,
  controlRef,
  thumbRef,
  value,
  max,
  onChange,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  controlRef: RefObject<HTMLDivElement | null>;
  thumbRef: RefObject<HTMLDivElement | null>;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const readCurrent = useEffectEvent(() => ({ value, max }));
  const emit = useEffectEvent((next: number) => onChange(next));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    let gesture: {
      pointerId: number;
      startX: number;
      startY: number;
      thumbOffset: number;
      dragging: boolean;
      last: number;
    } | null = null;

    const valueAt = (clientX: number) => {
      const control = controlRef.current?.getBoundingClientRect();
      const thumb = thumbRef.current?.getBoundingClientRect();
      if (!control || !thumb) {
        return null;
      }

      const travel = control.width - thumb.width;
      if (travel <= 0) {
        return null;
      }
      const fraction = Math.min(Math.max((clientX - control.left - thumb.width / 2) / travel, 0), 1);
      return Math.round((fraction * readCurrent().max) / SLIDER_STEP) * SLIDER_STEP;
    };

    const detach = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("pointercancel", onPointerEnd);
    };

    const finish = () => {
      if (gesture?.dragging) {
        setDragging(false);
      }
      gesture = null;
      detach();
    };

    function onPointerMove(event: PointerEvent) {
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }
      if (!gesture.dragging) {
        const dx = Math.abs(event.clientX - gesture.startX);
        const dy = Math.abs(event.clientY - gesture.startY);
        if (dy >= TOUCH_DRAG_THRESHOLD && dy >= dx) {

          finish();
          return;
        }
        if (dx < TOUCH_DRAG_THRESHOLD || dx <= dy) {
          return;
        }
        gesture.dragging = true;
        setDragging(true);
      }
      const next = valueAt(event.clientX - gesture.thumbOffset);
      if (next !== null && next !== gesture.last) {
        gesture.last = next;
        emit(next);
      }
    }

    function onPointerEnd(event: PointerEvent) {
      if (gesture && event.pointerId === gesture.pointerId) {
        finish();
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        return;
      }

      event.stopPropagation();
      if (gesture || !event.isPrimary) {
        return;
      }
      const thumb = thumbRef.current?.getBoundingClientRect();
      const center = thumb ? thumb.left + thumb.width / 2 : event.clientX;
      const onThumb = thumb !== undefined && Math.abs(event.clientX - center) <= thumb.width / 2 + THUMB_TOUCH_SLOP;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,

        thumbOffset: onThumb ? event.clientX - center : 0,
        dragging: false,
        last: readCurrent().value,
      };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerEnd);
      document.addEventListener("pointercancel", onPointerEnd);
    };


    const onTouchStart = (event: TouchEvent) => event.stopPropagation();

    root.addEventListener("pointerdown", onPointerDown, { capture: true });
    root.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, { capture: true });
      root.removeEventListener("touchstart", onTouchStart, { capture: true });
      detach();
    };
  }, [rootRef, controlRef, thumbRef]);

  return dragging;
}


function wholeStepFrom(value: number, delta: number, max: number) {
  const next = delta > 0 ? Math.floor(value + delta) : Math.ceil(value + delta);
  return Math.min(Math.max(next, 0), max);
}
