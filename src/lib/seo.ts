import type { Metadata } from "next";

export const SITE_NAME = "VeriCert";
export const DEFAULT_DESCRIPTION =
  "VeriCert supplies third-party tested research peptides and reference compounds for laboratory use, with a certificate of analysis for every batch.";

// Builds consistent title/description/canonical/OG/Twitter metadata for a page.
export function buildMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  noIndex = false,
  image = "/opengraph-image",
}: {
  title: string;
  description?: string;
  path?: string;
  noIndex?: boolean;
  image?: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
