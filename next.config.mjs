/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  experimental: {
    optimizePackageImports: ["@vercel/analytics"]
  }
};

export default nextConfig;
