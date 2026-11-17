"use client";

import { useEffect, useRef } from "react";

type OrientationEventStatic = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Phone tilt as a pair of -1..1 values, for parallax. On iOS the motion
 * permission can only be requested from a tap, so we ask on the first touch.
 */
export function useTilt() {
  const tilt = useRef({ x: 0, y: 0, active: false });
  useEffect(() => {
    if (typeof DeviceOrientationEvent === "undefined") return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      tilt.current.active = true;
      tilt.current.x = Math.max(-1, Math.min(1, e.gamma / 28));
      tilt.current.y = Math.max(-1, Math.min(1, (e.beta - 50) / 28));
    };
    const listen = () => window.addEventListener("deviceorientation", onOrientation);
    const request = (DeviceOrientationEvent as unknown as OrientationEventStatic).requestPermission;
    const onFirstTouch = () => {
      request?.call(DeviceOrientationEvent).then((state) => state === "granted" && listen(), () => {});
    };
    if (request) window.addEventListener("pointerup", onFirstTouch, { once: true });
    else listen();
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("pointerup", onFirstTouch);
    };
  }, []);
  return tilt;
}
