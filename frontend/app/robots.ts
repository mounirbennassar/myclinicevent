import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/e/"], disallow: ["/admin", "/sponsor", "/member", "/r/", "/verify/", "/login", "/api/"] }],
  };
}
