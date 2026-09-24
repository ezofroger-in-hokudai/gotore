/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // 同一Wi-Fi上の実機から開発中の画面を確認できるようにする。
  allowedDevOrigins: ["192.168.0.28"],
  async rewrites() {
    // Vercel Servicesではルートの設定がAPIを振り分ける。
    if (process.env.VERCEL === "1") return [];
    const backend = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
