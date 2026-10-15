"use client";

// Hands a chosen .pptx from the dashboard to /redesign without re-uploading (same page session).
let pending: File | null = null;

export function setPendingRedesign(f: File) {
  pending = f;
}

export function takePendingRedesign(): File | null {
  const f = pending;
  pending = null;
  return f;
}
