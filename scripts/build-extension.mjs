// Keeps shared files in sync and packages the Chrome extension.
//
//   npm run sync                                  copy shared files only
//   PONDER_API=https://your-app.vercel.app npm run build:ext
//                                                 sync, then write dist/ponder-extension-<version>.zip
//                                                 pointed at your deployed API, ready for the Web Store
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const p = (...s) => join(root, ...s);

// Source of truth -> copies. test/sync.test.js fails if these drift.
export const SHARED = [
  ['lib/video.js', 'public/lib/video.js'],
  ['lib/sample-pack.js', 'public/lib/sample-pack.js'],
  ['lib/video.js', 'extension/lib/video.js'],
  ['public/render.js', 'extension/render.js'],
  ['public/client.js', 'extension/client.js'],
  ['public/ponder.css', 'extension/ponder.css'],
];

export function sync() {
  for (const [from, to] of SHARED) {
    mkdirSync(dirname(p(to)), { recursive: true });
    cpSync(p(from), p(to));
  }
}

function build() {
  const api = (process.env.PONDER_API || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(api)) {
    console.error('Set PONDER_API to your deployed API origin, e.g. PONDER_API=https://ponder.vercel.app');
    process.exit(1);
  }
  const out = p('dist/extension');
  rmSync(p('dist'), { recursive: true, force: true });
  cpSync(p('extension'), out, { recursive: true });

  writeFileSync(join(out, 'config.js'), readFileSync(join(out, 'config.js'), 'utf8').replace(/'http[^']*'/, `'${api}'`));

  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  manifest.host_permissions = [
    ...manifest.host_permissions.filter((h) => !h.startsWith('http://localhost')),
    `${api}/*`,
  ];
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const zipPath = p(`dist/ponder-extension-${manifest.version}.zip`);
  writeFileSync(zipPath, zipDir(out));
  console.log(`Built ${relative(root, zipPath)} (API: ${api})`);
}

// Minimal zip writer so packaging works on any OS with no dependencies.
function zipDir(dir) {
  const files = [];
  (function walk(d) {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push([relative(dir, full).split('\\').join('/'), readFileSync(full)]);
    }
  })(dir);

  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name);
    const comp = deflateRawSync(data);
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0x21, 12); // 1980-01-01
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    local.push(h, nameBuf, comp);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-extension.mjs')) {
  sync();
  if (process.argv.includes('--sync-only')) console.log('Shared files synced.');
  else build();
}
