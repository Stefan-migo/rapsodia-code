import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, readdirSync, statSync } from 'fs';
import { join, relative, basename, extname, sep } from 'path';
import { createHash } from 'crypto';
import { PROJECT_STATE_DIR_NAME } from '../utils/state';
import { pythonCommand } from '../utils/exec';

export interface TemplateOptions {
  projectName: string;
  projectType: 'default' | 'api' | 'web' | 'cli' | 'lib';
  date: string;
  year: string;
}

const TEMPLATE_DIR = join(__dirname, '..', 'src', 'template');

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.db', '.sqlite',
]);

function isTextFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext) && !filePath.endsWith('.gitkeep');
}

function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

export function substituteVariables(content: string, options: TemplateOptions): string {
  return content
    .replace(/\{PROJECT_NAME\}/g, options.projectName)
    .replace(/\{PROJECT_NAME_KEBAB\}/g, kebabCase(options.projectName))
    .replace(/\{DATE\}/g, options.date)
    .replace(/\{YEAR\}/g, options.year)
    .replace(/\{PYTHON_COMMAND\}/g, () => pythonCommand());
}

/**
 * The one place the text/binary rule lives. `copyTemplate`, `hashTemplateFile` and `update` all
 * project through it, so the hash recorded for a generated file is the hash of the bytes that were
 * actually written; resolving the substitution anywhere else would make every project report a
 * placeholder-bearing file as modified forever.
 *
 * `substituteVariables` resolves the interpreter lazily, per match, so the probe runs for the one
 * file that carries the placeholder instead of once per template file per loop.
 */
export function projectTemplateFile(filePath: string, options: TemplateOptions): string | Buffer {
  if (!isTextFile(filePath)) return readFileSync(filePath);
  return substituteVariables(readFileSync(filePath, 'utf-8'), options);
}

export function collectFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, baseDir));
    } else {
      files.push(relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return files;
}

/**
 * `mkdirSync` and `writeFileSync` follow symlinks, so a link planted inside the target directory
 * would redirect a template write outside it. A template write is never worth that: refuse the
 * path and report it instead.
 */
function staysInsideTarget(targetDir: string, targetPath: string): boolean {
  const relativePath = relative(targetDir, targetPath);
  if (relativePath === '' || relativePath.startsWith('..')) return false;
  let current = targetDir;
  for (const part of relativePath.split(sep)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) return false;
    } catch {
      // The component does not exist yet, so neither do the ones below it.
      return true;
    }
  }
  return true;
}

export function copyTemplate(targetDir: string, options: TemplateOptions): { copied: string[]; refused: string[] } {
  const copied: string[] = [];
  const refused: string[] = [];
  const allFiles = collectFiles(TEMPLATE_DIR, TEMPLATE_DIR);

  for (const file of allFiles) {
    const sourcePath = join(TEMPLATE_DIR, file);
    const targetPath = join(targetDir, file);
    const targetParent = join(targetPath, '..');

    if (!staysInsideTarget(targetDir, targetPath)) {
      refused.push(file);
      continue;
    }

    mkdirSync(targetParent, { recursive: true });

    writeFileSync(targetPath, projectTemplateFile(sourcePath, options));

    copied.push(file);
  }

  return { copied, refused };
}

export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Hash a template file the way it will exist in the project. A manifest records the hash of the
 * project file, so comparing it against the raw template hash would report every file that carries
 * a placeholder as modified forever.
 */
export function hashTemplateFile(filePath: string, options: TemplateOptions): string {
  return createHash('sha256').update(projectTemplateFile(filePath, options)).digest('hex');
}

export function hashDirectory(dir: string): string[] {
  const allFiles: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.name === PROJECT_STATE_DIR_NAME || entry.name === '.git') continue;
    if (entry.isDirectory()) {
      allFiles.push(...hashDirectory(fullPath));
    } else {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}
