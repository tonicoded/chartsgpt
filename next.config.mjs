/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  experimental: {
    optimizePackageImports: ["@vercel/analytics"]
  },
  outputFileTracingIncludes: {
    "/*": ["./index.html", "./about/**/*", "./privacy/**/*", "./terms/**/*", "./support/**/*", "./blog/**/*", "./styles.css"]
  }
};

export default nextConfig;

