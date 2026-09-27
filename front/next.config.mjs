/** @type {import('next').NextConfig} */
const target = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
