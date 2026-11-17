/** A reference image passed from the analyzer to the try-on screen. In memory only: never stored, never uploaded until the user taps try. */
let pending: Blob | null = null;
export const setPendingReference = (blob: Blob | null) => void (pending = blob);
export const takePendingReference = () => {
  const blob = pending;
  pending = null;
  return blob;
};
