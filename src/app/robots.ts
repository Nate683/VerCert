import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const SITE_URL = getSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/command",
        "/office",
        "/account",
        "/cart",
        "/checkout",
        "/order",
        "/api",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/unsubscribe",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
