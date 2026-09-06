/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    // Vercel Servicesではルートの設定がAPIを振り分ける。
    if (process.env.VERCEL === "1") return [];
    const backend = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
