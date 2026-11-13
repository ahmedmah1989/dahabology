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
// outline in the logo's own pixels (1536 x 1536), clockwise from the top of the crown
const outline = [[770, 105], [905, 185], [940, 335], [1015, 340], [1118, 398], [1146, 500], [1240, 560], [1278, 690], [1252, 830], [1165, 965], [1030, 1075], [960, 1092],
  [245, 1092], [240, 1040], [285, 1000], [285, 420], [262, 345], [596, 340], [602, 235], [640, 185]];
const k = size / box.width, pts = outline.map(([x, y]) => ((x - box.left) * k).toFixed(1) + ',' + ((y - box.top) * k).toFixed(1)).join(' ');
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
     <defs><filter id="f" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter></defs>
     <polygon points="${pts}" fill="#fff" stroke="#fff" stroke-width="10" stroke-linejoin="round" filter="url(#f)"/>
   </svg>`);
await sharp(src).extract(box).resize(size).ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .webp({ quality: 82 }).toFile(out('emblem.webp'));
console.log('images written to', dir);
