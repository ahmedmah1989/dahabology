// Builds the light image set from the original logo. Run: node scripts/images.mjs
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const src = path.join(dir, 'dahabology-original.png');
const out = f => path.join(dir, f);

// Full logo: page watermark / home backdrop, header badge, icons.
await sharp(src).resize(900).webp({ quality: 72 }).toFile(out('logo-900.webp'));
await sharp(src).resize(192).webp({ quality: 80 }).toFile(out('logo-192.webp'));
await sharp(src).resize(192).png().toFile(out('icon-192.png'));
await sharp(src).resize(512).png().toFile(out('icon-512.png'));

// Emblem: only the D + Tutankhamun, feathered to transparent so nothing else of the logo shows.
const box = { left: 220, top: 60, width: 1100, height: 1100 };
const size = 640;
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
     <defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
       <stop offset="86%" stop-color="#fff"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
     </radialGradient></defs>
     <ellipse cx="${size / 2}" cy="${size * 0.5}" rx="${size * 0.47}" ry="${size * 0.5}" fill="url(#g)"/>
   </svg>`);
await sharp(src).extract(box).resize(size).ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .webp({ quality: 82 }).toFile(out('emblem.webp'));
console.log('images written to', dir);
