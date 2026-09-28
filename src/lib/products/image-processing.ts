import sharp, { type OutputInfo } from "sharp";
import { PRODUCT_IMAGE_MAX_EDGE } from "./image-rules";

export class InvalidProductImageError extends Error {}

export type ProcessedProductImage = {
  data: Buffer;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  width: number;
  height: number;
};

// Normalises an uploaded product photo before it's stored:
//  - the format is read from the file's bytes, not its name or claimed type;
//  - EXIF orientation is applied to the pixels, then every piece of metadata
//    (EXIF, GPS, camera, XMP, ICC) is dropped — sharp writes none unless asked;
//  - the long edge is capped at PRODUCT_IMAGE_MAX_EDGE, never enlarged;
//  - it's recompressed in its own format. PNG and WEBP keep their alpha channel
//    untouched: nothing here flattens onto a background.
export async function processProductImage(input: Buffer): Promise<ProcessedProductImage> {
  let format: string | undefined;
  try {
    // 40 megapixels is far past any product render and stops a decompression bomb.
    format = (await sharp(input, { limitInputPixels: 40_000_000 }).metadata()).format;
  } catch {
    throw new InvalidProductImageError("The file couldn't be read as an image.");
  }

  const pipeline = sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: PRODUCT_IMAGE_MAX_EDGE, height: PRODUCT_IMAGE_MAX_EDGE, fit: "inside", withoutEnlargement: true });

  let result: { data: Buffer; info: OutputInfo };
  let contentType: ProcessedProductImage["contentType"];
  let extension: ProcessedProductImage["extension"];
  switch (format) {
    case "png":
      // Lossless: deflate at maximum effort. No palette quantisation, which
      // would band the soft edges of a transparent render.
      result = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true });
      contentType = "image/png";
      extension = "png";
      break;
    case "jpeg":
      result = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      contentType = "image/jpeg";
      extension = "jpg";
      break;
    case "webp":
      result = await pipeline.webp({ quality: 85, alphaQuality: 100 }).toBuffer({ resolveWithObject: true });
      contentType = "image/webp";
      extension = "webp";
      break;
    default:
      throw new InvalidProductImageError("Only PNG, JPG or WEBP images are accepted.");
  }

  return { data: result.data, contentType, extension, width: result.info.width, height: result.info.height };
}
