import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getProductBySlug } from "@/lib/products";
import { incomingImagePrefix, PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_TYPES } from "@/lib/products/image-rules";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Issues the short-lived token that lets the browser upload the original
// straight to Blob. A 10MB file can't pass through a Vercel function (4.5MB
// request limit), and a direct upload gives the uploader real progress. The
// token only allows this product's incoming folder, the three image types and
// 10MB; the server then processes the file (see ../route.ts).
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { slug } = await params;
  if (!(await getProductBySlug(slug))) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(incomingImagePrefix(slug))) throw new Error("Upload path not allowed.");
        return {
          allowedContentTypes: Object.keys(PRODUCT_IMAGE_TYPES),
          maximumSizeInBytes: PRODUCT_IMAGE_MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload refused." }, { status: 400 });
  }
});
