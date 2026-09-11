import type { CSSProperties } from "react";

// 高得点はテーマの赤。青から緑・暖色を通り、紫を避ける。
const stops = [
  [36, 106, 211],
  [87, 173, 131],
  [232, 202, 74],
  [229, 139, 40],
  [217, 35, 46],
];
const rgb = (values: number[]) => `rgb(${values.join(", ")})`;
export const scoreGradient = `linear-gradient(to right, ${stops.map(rgb).join(", ")})`;

export function scoreAppearance(value: number | null | undefined): CSSProperties {
  if (value == null || !Number.isFinite(value))
    return { "--score-bg": "rgb(232, 233, 237)", "--score-ink": "#505564" } as CSSProperties;
  const position = Math.max(0, Math.min(100, value)) / 25;
  const index = Math.min(3, Math.floor(position));
  const fraction = position - index;
  const channels = stops[index].map((channel, i) =>
    Math.round(channel + (stops[index + 1][i] - channel) * fraction),
  );
  const linear = channels.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return {
    "--score-bg": rgb(channels),
    "--score-ink": luminance > 0.179 ? "#101218" : "#ffffff",
  } as CSSProperties;
}
