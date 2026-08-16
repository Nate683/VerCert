import sharp from "sharp";
import path from "path";

const PUBLIC = path.join(process.cwd(), "public");

async function toTransparentPng(inputName, outputName, threshold = 235, crop) {
  const input = path.join(PUBLIC, inputName);
  const output = path.join(PUBLIC, outputName);

  let pipeline = sharp(input);
  if (crop) pipeline = pipeline.extract(crop);

  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0; // fully transparent
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(output);

  console.log(`Wrote ${outputName} (${width}x${height})`);
}

await toTransparentPng("Logo.jpg", "logo.png");
await toTransparentPng("Logo Face.jpg", "icon-source.png", 235, { left: 0, top: 0, width: 90, height: 75 });

// Square, padded app icon/favicon at a standard size.
await sharp(path.join(PUBLIC, "icon-source.png"))
  .resize(440, 440, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 36, bottom: 36, left: 36, right: 36, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(PUBLIC, "icon.png"));
console.log("Wrote icon.png (512x512)");


