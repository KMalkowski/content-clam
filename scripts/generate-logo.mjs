import sharp from "sharp";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../assets/brand/content-clam-source.jpg", import.meta.url));
const logoPath = fileURLToPath(new URL("../extension/public/brand/content-clam-logo.png", import.meta.url));
const iconDirectory = fileURLToPath(new URL("../extension/public/icon/", import.meta.url));
const sizes = [16, 32, 48, 128];

const { data, info } = await sharp(sourcePath).raw().toBuffer({ resolveWithObject: true });
const pixels = Buffer.alloc(info.width * info.height * 4);

for (let index = 0; index < info.width * info.height; index += 1) {
  const source = index * info.channels;
  const target = index * 4;
  const red = data[source];
  const green = data[source + 1];
  const blue = data[source + 2];
  const x = index % info.width;
  const y = Math.floor(index / info.width);
  const navyAlpha = blue > green ? opacity(blue - red, 55) : 0;
  const coralAlpha = red > green ? opacity(red - blue, 134) : 0;

  if ((x - 512) ** 2 + (y - 584) ** 2 < 68 ** 2 && Math.max(red, green, blue) - Math.min(red, green, blue) < 20) {
    pixels[target] = 235;
    pixels[target + 1] = 236;
    pixels[target + 2] = 232;
    pixels[target + 3] = 255;
  } else if (coralAlpha > navyAlpha) {
    pixels[target] = 238;
    pixels[target + 1] = 113;
    pixels[target + 2] = 94;
    pixels[target + 3] = coralAlpha;
  } else {
    pixels[target] = 24;
    pixels[target + 1] = 47;
    pixels[target + 2] = 80;
    pixels[target + 3] = navyAlpha;
  }
}

removeSmallComponents(pixels, info.width, info.height);

const extracted = sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } }).extract({
  left: 54,
  top: 174,
  width: 916,
  height: 666,
});
const mark = await extracted.resize({ width: 460, height: 334, fit: "fill" }).png().toBuffer();
const logo = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: mark, left: 26, top: 89 }])
  .png()
  .toBuffer();

await sharp(logo).toFile(logoPath);

for (const size of sizes) {
  const diameter = Math.max(size - 2, 1);
  const circle = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${diameter / 2}" fill="white"/></svg>`,
  );
  const iconMark = await sharp(logo)
    .resize({ width: Math.round(size * 0.92), height: Math.round(size * 0.92), fit: "contain" })
    .png()
    .toBuffer();
  const metadata = await sharp(iconMark).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: circle, left: 0, top: 0 },
      { input: iconMark, left: Math.floor((size - metadata.width) / 2), top: Math.floor((size - metadata.height) / 2) },
    ])
    .png()
    .toFile(`${iconDirectory}${size}.png`);
}

function opacity(difference, solidDifference) {
  return Math.round(255 * Math.max(0, Math.min(1, (difference - 3) / (solidDifference - 3))));
}

function removeSmallComponents(rgba, width, height) {
  const visited = new Uint8Array(width * height);
  const keep = new Uint8Array(width * height);
  const neighbors = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];

  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || rgba[start * 4 + 3] < 12) continue;
    const component = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const current = component[cursor];
      const x = current % width;
      for (const offset of neighbors) {
        const next = current + offset;
        const nextX = next % width;
        if (next < 0 || next >= width * height || Math.abs(nextX - x) > 1 || visited[next] || rgba[next * 4 + 3] < 12) continue;
        visited[next] = 1;
        component.push(next);
      }
    }

    if (component.length >= 500) {
      for (const index of component) keep[index] = 1;
    }
  }

  for (let index = 0; index < width * height; index += 1) {
    if (!keep[index]) rgba[index * 4 + 3] = 0;
  }
}
