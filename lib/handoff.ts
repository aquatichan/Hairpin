/**
 * A screenshot passed from the analyzer to the try-on studio, with the name and summary Decode gave it.
 * In memory only: never stored, never uploaded until the person taps generate.
 */
export type PendingReference = { blob: Blob; name: string | null; summary: string | null };

let pending: PendingReference | null = null;
export const setPendingReference = (value: PendingReference | null) => void (pending = value);
export const takePendingReference = () => {
  const value = pending;
  pending = null;
  return value;
};
