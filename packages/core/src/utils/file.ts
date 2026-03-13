import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, content, 'utf-8');
}

export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}

export async function listDirs(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) return [];
  const entries = await readdir(dirPath);
  const dirs: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) dirs.push(entry);
  }
  return dirs.sort().reverse();
}
