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
const outline = [[770,140],[850,180],[915,310],[955,370],[1040,385],[1135,450],[1195,560],[1210,700],[1190,850],[1130,965],[1040,1040],[940,1078],[280,1085],[315,1040],[360,975],[360,485],[302,440],[292,350],[570,367],[620,260],[660,200]];
const k = size / box.width, pts = outline.map(([x, y]) => ((x - box.left) * k).toFixed(1) + ',' + ((y - box.top) * k).toFixed(1)).join(' ');
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
     <defs><filter id="f" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.2"/></filter></defs>
     <polygon points="${pts}" fill="#fff" stroke="#fff" stroke-width="5" stroke-linejoin="round" filter="url(#f)"/>
   </svg>`);
await sharp(src).extract(box).resize(size).ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .webp({ quality: 82 }).toFile(out('emblem.webp'));
console.log('images written to', dir);
