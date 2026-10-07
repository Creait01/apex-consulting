/** @type {import('next').NextConfig} */
const nextConfig = {
  // El build ahora verifica tipos: un error de TypeScript no llega a producción.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
  poweredByHeader: false,
  experimental: {
    // Chrome sin interfaz para los PDF de los correos: se cargan tal cual desde node_modules
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  },
}

export default nextConfig
