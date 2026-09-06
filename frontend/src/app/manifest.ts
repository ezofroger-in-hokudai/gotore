import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GO TORE",
    short_name: "GO TORE",
    description: "仲間とトレーニングを記録・共有するGO TORE",
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f7f5",
    theme_color: "#941b22",
    icons: [192, 512].map((size) => ({
      src: `/app-icons/${size}`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
