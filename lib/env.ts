/** A value still holding its PLACEHOLDER_[NAME] marker counts as not set. */
export const real = (value: string | undefined) => (value && !value.startsWith("PLACEHOLDER_[") ? value : undefined);
