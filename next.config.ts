import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Emit trailing-slash directories so every route resolves to an index.html,
  // which keeps static hosting (Firebase Hosting) routing simple.
  trailingSlash: true,
};

export default nextConfig;
