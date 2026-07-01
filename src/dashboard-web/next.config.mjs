/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard is a pure read-only frontend; no image optimisation is needed.
  images: { unoptimized: true },
};

export default nextConfig;
