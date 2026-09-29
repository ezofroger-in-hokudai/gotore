export function heatLevel(volume: number | null, volumes: number[]): 0 | 1 | 2 | 3 | 4 {
  if (volume === null) return 0;
  if (volume <= 0) return 1;
  const active = volumes.filter((value) => value > 0);
  const minimum = Math.min(...active);
  const maximum = Math.max(...active);
  if (maximum <= minimum) return 4;
  return Math.max(1, Math.min(4, Math.round(((volume - minimum) / (maximum - minimum)) * 3) + 1)) as
    | 1
    | 2
    | 3
    | 4;
}
