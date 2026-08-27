import { readFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

async function walk(dir) {
  const entries = await readdir(dir);
  const result = [];
  for (const entry of entries) {
    if (entry === '.git' || entry === 'node_modules' || entry === '.wrangler') continue;
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) result.push(...await walk(full));
    else result.push(full);
  }
  return result;
}

async function exists(relativePath) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function repoRelative(value) {
  const raw = String(value || '').trim().replace(/^\.\//, '');
  if (!raw || /^(data:|blob:|https?:)/i.test(raw)) return '';
  return raw;
}

function readJsonSafe(file) {
  return readFile(path.join(root, file), 'utf8').then((text) => JSON.parse(text));
}

const files = await walk(root);

for (const file of files.filter((file) => file.endsWith('.json'))) {
  try {
    JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    failures.push(`无效 JSON：${path.relative(root, file)} (${error.message})`);
  }
}

for (const file of ['js/app.js', 'service-worker.js']) {
  try {
    execFileSync('node', ['--check', file], { cwd: root, stdio: 'pipe' });
  } catch (error) {
    failures.push(`JavaScript 语法错误：${file}\n${error.stderr}`);
  }
}

const sw = await readFile(path.join(root, 'service-worker.js'), 'utf8');
const assetRefs = [...sw.matchAll(/['"](?:\.\/)?((?:data|assets)\/[^'"]+)['"]/g)].map((match) => match[1]);
for (const ref of assetRefs) {
  if (!(await exists(ref))) failures.push(`Service Worker 引用了不存在的资源：${ref}`);
}

const diaryIndex = await readJsonSafe('data/diary/index.json');
for (const diary of diaryIndex.items || []) {
  if (!diary.sourcePath) continue;
  if (!(await exists(diary.sourcePath))) failures.push(`日记索引引用了不存在的 Markdown：${diary.sourcePath}`);
}

const gallery = await readJsonSafe('data/gallery/gallery.json');
for (const photo of gallery.albums || []) {
  const refs = [repoRelative(photo.thumbnail), repoRelative(photo.src), repoRelative(photo.path)].filter(Boolean);
  for (const ref of refs) {
    if (!(await exists(ref))) warnings.push(`照片索引引用了本地不存在的资源：${ref}（如果文件只在 GitHub 远端，管理模式下会用 Token 读取）`);
  }
}

const music = await readJsonSafe('data/music/tracks.json');
for (const track of music.tracks || []) {
  const ref = repoRelative(track.src);
  if (ref && !(await exists(ref))) warnings.push(`音乐索引引用了本地不存在的资源：${ref}（如果文件只在 GitHub 远端，管理模式下会用 Token 读取）`);
}

if (warnings.length) console.warn(warnings.join('\n'));

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`验证通过：${files.length} 个项目文件、JSON、JavaScript 语法、离线资源、日记索引和必要媒体索引均一致。`);
