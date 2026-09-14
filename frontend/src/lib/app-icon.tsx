import { WombatBody } from "@/features/branding/wombat";
import { ImageResponse } from "next/og";

export function appIcon(size: number) {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#f3e9da",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label="GO TOREのウォンバット"
      >
        <g transform="translate(-43 -29) scale(1.1)">{WombatBody()}</g>
      </svg>
    </div>,
    { width: size, height: size },
  );
}
