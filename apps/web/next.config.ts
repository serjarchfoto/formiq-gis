import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingIncludes: {
    "/api/data/microsoft-buildings": [
      "./data/microsoft-buildings/dataset-links.csv",
    ],
  },
};

export default nextConfig;
