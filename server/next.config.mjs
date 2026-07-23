/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output makes for a small, self-contained Docker runtime image.
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    // Keep these server-only packages out of the bundle (native addons / node deps).
    serverComponentsExternalPackages: ['@libsql/client', 'nodemailer', 'web-push', 'node-cron'],
    // Run instrumentation.ts on boot (applies DB migrations).
    instrumentationHook: true,
    // Include the migration SQL in the standalone output's file tracing so the
    // boot-time migrator can find them inside the Docker image.
    outputFileTracingIncludes: {
      '/': ['./db/migrations/**/*'],
    },
  },
};

export default nextConfig;
