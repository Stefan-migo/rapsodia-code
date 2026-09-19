import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative, basename, extname } from 'path';
import { createHash } from 'crypto';
import { PROJECT_STATE_DIR_NAME } from '../utils/state';
import { resolvePythonCommand } from '../utils/exec';

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

/**
 * The interpreter a generated project names for the Graphify MCP server. opencode launches that
 * command itself, so a hardcoded name cannot be right on both platforms: `python3` is a Microsoft
 * Store App Execution Alias on Windows and is not guaranteed to be a working interpreter there.
 *
 * Falling back to `python3` keeps the POSIX output byte-identical when nothing resolves.
 */
function pythonCommand(): string {
  return resolvePythonCommand() ?? (process.platform === 'win32' ? 'python' : 'python3');
}

/**
 * Resolving the interpreter here, rather than after the copy, is what keeps the manifest honest.
 * `copyTemplate` and `hashTemplateFile` both route through this function, so the hash recorded for
 * the generated file is the hash of the bytes that were actually written; resolving it anywhere
 * else would make every project report `opencode.json` as modified forever.
 *
 * The replacement is a function on purpose: a function replacer only runs on a match, so the
 * interpreter probe happens for the one file that carries the placeholder instead of once per
 * template file per loop.
 */
export function substituteVariables(content: string, options: TemplateOptions): string {
  return content
    .replace(/\{PROJECT_NAME\}/g, options.projectName)
    .replace(/\{PROJECT_NAME_KEBAB\}/g, kebabCase(options.projectName))
    .replace(/\{DATE\}/g, options.date)
    .replace(/\{YEAR\}/g, options.year)
    .replace(/\{PYTHON_COMMAND\}/g, () => pythonCommand());
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

export function copyTemplate(targetDir: string, options: TemplateOptions): string[] {
  const copiedFiles: string[] = [];
  const allFiles = collectFiles(TEMPLATE_DIR, TEMPLATE_DIR);

  for (const file of allFiles) {
    const sourcePath = join(TEMPLATE_DIR, file);
    const targetPath = join(targetDir, file);
    const targetParent = join(targetPath, '..');

    mkdirSync(targetParent, { recursive: true });

    if (isTextFile(sourcePath)) {
      let content = readFileSync(sourcePath, 'utf-8');
      content = substituteVariables(content, options);
      writeFileSync(targetPath, content, 'utf-8');
    } else {
      writeFileSync(targetPath, readFileSync(sourcePath));
    }

    copiedFiles.push(file);
  }

  return copiedFiles;
}

export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Hash a template file the way it will exist in the project: text files are hashed after
 * variable substitution, binary files byte-for-byte. A manifest records the hash of the
 * project file, so comparing it against the raw template hash would report every file that
 * carries a placeholder as modified forever. Mirrors copyTemplate's text/binary rule.
 */
export function hashTemplateFile(filePath: string, options: TemplateOptions): string {
  if (!isTextFile(filePath)) return hashFile(filePath);
  return createHash('sha256').update(substituteVariables(readFileSync(filePath, 'utf-8'), options)).digest('hex');
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
