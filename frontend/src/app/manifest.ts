import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "E-GOTORE",
    short_name: "E-GOTORE",
    description: "仲間とトレーニングを記録・共有するE-GOTORE",
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f7f5",
    theme_color: "#941b22",
    icons: [192, 512].map((size) => ({
      src: `/app-icons/${size}?v=wombat-a`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
