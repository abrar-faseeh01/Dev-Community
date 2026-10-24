import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker er jonno standalone, Vercel e dorkar nai
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
