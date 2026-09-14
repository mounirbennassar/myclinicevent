import type { NextConfig } from "next";

// The FastAPI backend. The browser only ever talks to this Next.js app; /api/* is proxied,
// so session cookies stay first-party and there's no CORS to configure.
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image (see frontend/Dockerfile).
  output: "standalone",
  // Lets you open the dev server through a Cloudflare tunnel to test the camera scanner on a phone.
  allowedDevOrigins: ["*.trycloudflare.com"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ];
    return [
      { source: "/:path*", headers: common },
      // The public registration page can be embedded on the My Clinic website; the admin can't.
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/login", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
