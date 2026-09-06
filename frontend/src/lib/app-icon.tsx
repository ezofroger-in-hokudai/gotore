import { ImageResponse } from "next/og";

export function appIcon(size: number) {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#941b22",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size * 0.64} height={size * 0.64} viewBox="0 0 100 100" fill="#ffffff">
        <title>GO TOREのダンベル</title>
        <rect x="30" y="44" width="40" height="12" rx="3" />
        <rect x="19" y="24" width="16" height="52" rx="5" />
        <rect x="65" y="24" width="16" height="52" rx="5" />
        <rect x="9" y="35" width="10" height="30" rx="3" />
        <rect x="81" y="35" width="10" height="30" rx="3" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
