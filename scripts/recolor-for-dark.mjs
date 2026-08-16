// Recolors the navy/gray pixels of a transparent logo/icon PNG to a light
// off-white so it reads correctly against the site's dark navy/black
// surfaces, while preserving the gold accent pixels untouched.
import sharp from "sharp";

const OFFWHITE = [243, 236, 221]; // matches --foreground

async function recolor(inputPath, outputPath, { mutedAlphaScale = 1 } = {}) {
  const img = sharp(inputPath);
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a === 0) continue;

    const isGold = r > g && g > b && r - b > 30 && r > 90;
    if (isGold) continue; // keep gold accent as-is

    const isGray = Math.abs(r - g) < 12 && Math.abs(g - b) < 12; // near-neutral gray (subtitle)
    out[i] = OFFWHITE[0];
    out[i + 1] = OFFWHITE[1];
    out[i + 2] = OFFWHITE[2];
    out[i + 3] = isGray ? Math.round(a * mutedAlphaScale) : a;
  }

  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(outputPath);
}

await recolor("public/logo.png", "public/logo-recolored.png", { mutedAlphaScale: 0.75 });
await recolor("public/icon.png", "public/icon-watermark.png");
console.log("done");
