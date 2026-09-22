import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./v2.css";
import "../styles/recording-controls.css";

export const metadata: Metadata = {
  title: "E-GOTORE — 離れていても、合トレ。",
  description: "仲間とトレーニングを記録・共有するE-GOTORE",
  applicationName: "E-GOTORE",
  appleWebApp: { capable: true, title: "E-GOTORE", statusBarStyle: "default" },
  icons: { icon: "/app-icons/192?v=wombat-a", apple: "/apple-icon?v=wombat-a" },
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
