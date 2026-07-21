/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output makes for a small, self-contained Docker runtime image.
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    // Leave the libsql driver out of the server bundle (prebuilt native addon).
    serverComponentsExternalPackages: ['@libsql/client'],
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
