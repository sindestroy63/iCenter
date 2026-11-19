const nextConfig = {
  distDir: process.env.ICENTER_NEXT_DIST_DIR || (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  output: "standalone",
  images: { unoptimized: true, formats: ["image/webp"] },
};

export default nextConfig;
