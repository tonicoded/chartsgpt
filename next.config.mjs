/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  experimental: {
    optimizePackageImports: ["@vercel/analytics"]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Only HSTS was present before. No Content-Security-Policy here on
          // purpose: the site loads Vercel Analytics, Supabase and inline
          // scripts, so a CSP needs its own testing pass rather than a guess.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" }
        ]
      },
      {
        // Fingerprinted media and fonts never change under the same name.
        source: "/:file(.*\\.(?:woff2|webp|jpg|png|svg|mp4|webm))",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      }
    ];
  }
};

export default nextConfig;
