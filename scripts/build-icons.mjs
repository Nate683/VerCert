// Renders src/app/icon.svg (the VeriCert emblem) into the raster icons Next
// serves alongside it: favicon.ico (16/32/48) and apple-icon.png (180).
// Usage: node scripts/build-icons.mjs
import { readFileSync, writeFileSync } from "fs";
import sharp from "sharp";

const app = new URL("../src/app/", import.meta.url);
const svg = readFileSync(new URL("icon.svg", app));
const png = (size) => sharp(svg, { density: 72 * (size / 32) * 4 }).resize(size, size).png().toBuffer();

// An .ico is a small directory followed by PNG images, which every current
// browser reads.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});
writeFileSync(new URL("favicon.ico", app), Buffer.concat([header, ...images]));

// iOS draws its own rounded corners and doesn't do transparency, so the
// touch icon is the emblem on a full navy square.
const apple = svg.toString().replace('rx="6"', 'rx="0"');
writeFileSync(
  new URL("apple-icon.png", app),
  await sharp(Buffer.from(apple), { density: 72 * (180 / 32) * 2 }).resize(180, 180).png().toBuffer()
);
console.log("favicon.ico and apple-icon.png written");
