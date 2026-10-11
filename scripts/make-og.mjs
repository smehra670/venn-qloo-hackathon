import { writeFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";

const width = 1200;
const height = 630;
const paper = [246, 242, 234];
const coral = [255, 107, 87];
const blue = [79, 91, 255];
const plum = [107, 63, 160];
const ink = [27, 26, 46];
const soft = [85, 83, 107];

const glyphs = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  c: ["00000", "00000", "01110", "10000", "10000", "10001", "01110"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  w: ["00000", "00000", "10001", "10001", "10101", "10101", "01010"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
};

function blend(dst, src, alpha) {
  return [
    Math.round(src[0] * alpha + dst[0] * (1 - alpha)),
    Math.round(src[1] * alpha + dst[1] * (1 - alpha)),
    Math.round(src[2] * alpha + dst[2] * (1 - alpha)),
  ];
}

function inside(x, y, cx, cy, radius) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

const pixels = new Uint8Array(width * height * 3);
function setPixel(x, y, rgb) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * 3;
  pixels[index] = rgb[0];
  pixels[index + 1] = rgb[1];
  pixels[index + 2] = rgb[2];
}
function getPixel(x, y) {
  const index = (y * width + x) * 3;
  return [pixels[index], pixels[index + 1], pixels[index + 2]];
}

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    let color = paper;
    const inA = inside(x, y, 470, 250, 170);
    const inB = inside(x, y, 690, 250, 170);
    if (inA) color = blend(color, coral, 0.8);
    if (inB) color = blend(color, blue, 0.8);
    if (inA && inB) color = blend(color, plum, 0.72);
    setPixel(x, y, color);
  }
}

function drawText(text, scale, originX, baseline, color) {
  const advance = 6 * scale;
  let x = originX - (text.length * advance) / 2;
  for (const char of text) {
    const glyph = glyphs[char];
    if (!glyph) continue;
    glyph.forEach((row, rowIndex) => {
      for (let col = 0; col < row.length; col += 1) {
        if (row[col] !== "1") continue;
        for (let py = 0; py < scale; py += 1) {
          for (let px = 0; px < scale; px += 1) {
            setPixel(Math.round(x + col * scale + px), baseline + rowIndex * scale + py, color);
          }
        }
      }
    });
    x += advance;
  }
}

drawText("Venn", 14, 600, 455, ink);
drawText("Find who shares your crowd.", 4, 600, 575, soft);

const raw = Buffer.alloc(height * (1 + width * 3));
for (let y = 0; y < height; y += 1) {
  const row = y * (1 + width * 3);
  raw[row] = 0;
  Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 3, width * 3).copy(raw, row + 1);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

await writeFile(new URL("../public/og.png", import.meta.url), png);
console.log("Wrote public/og.png");
