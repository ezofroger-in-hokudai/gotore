import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GO TORE — 離れていても、合トレ。",
  description: "仲間とトレーニングを記録・共有するGO TORE",
  applicationName: "GO TORE",
  appleWebApp: { capable: true, title: "GO TORE", statusBarStyle: "default" },
  icons: { icon: "/app-icons/192", apple: "/apple-icon" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#941b22",
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
