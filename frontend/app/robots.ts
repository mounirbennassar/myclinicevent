import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/e/"], disallow: ["/admin", "/r/", "/verify/", "/login", "/api/"] }],
  };
}
