export type RGBA = [number, number, number, number];
export function parseColor(v: string): RGBA;
export function composite(fg: RGBA, bg: RGBA): RGBA;
export function contrast(a: RGBA, b: RGBA): number;
