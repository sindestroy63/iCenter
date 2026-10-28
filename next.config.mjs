const nextConfig = {
  distDir: process.env.ICENTER_NEXT_DIST_DIR || (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  images: { unoptimized: true },
};

export default nextConfig;
