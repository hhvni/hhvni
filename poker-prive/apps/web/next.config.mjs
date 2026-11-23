/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@poker/engine'],
  images: { unoptimized: true },
  devIndicators: false,
};
export default nextConfig;
