/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Permet de construire une nouvelle version à côté de celle en service (mise à jour sans coupure)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@poker/engine'],
  images: { unoptimized: true },
  devIndicators: false,
};
export default nextConfig;
