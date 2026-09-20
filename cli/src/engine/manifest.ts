import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { hashFile, hashDirectory, collectFiles, hashTemplateFile, TemplateOptions } from './template';
import { stateDir, statePath, PROJECT_STATE_DIR_NAME } from '../utils/state';

export interface ManifestFile {
  path: string;
  hash: string;
}

export interface Manifest {
  templateVersion: string;
  createdAt: string;
  projectName: string;
  files: ManifestFile[];
  excludedPaths?: string[];
}

export function generateManifest(targetDir: string, options: TemplateOptions): Manifest {
  const rapsodiaDir = stateDir(targetDir);
  if (!existsSync(rapsodiaDir)) {
    mkdirSync(rapsodiaDir, { recursive: true });
  }

  const filePaths = hashDirectory(targetDir);
  const files: ManifestFile[] = filePaths.map((fp) => ({
    path: relative(targetDir, fp).replace(/\\/g, '/'),
    hash: hashFile(fp),
  })).filter((f) => !f.path.startsWith(`${PROJECT_STATE_DIR_NAME}/`) && !f.path.startsWith('.git/'));

  const manifest: Manifest = {
    templateVersion: '1.0.0',
    createdAt: options.date,
    projectName: options.projectName,
    files,
  };

  writeFileSync(
    statePath(targetDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  return manifest;
}

/**
 * The substitution variables a project was created with. Both the classifier and the update writes
 * must use this: deriving them twice is what lets classify and write drift apart.
 */
export function templateOptionsFromManifest(manifest: Manifest): TemplateOptions {
  return {
    projectName: manifest.projectName,
    projectType: 'default',
    date: manifest.createdAt,
    year: (manifest.createdAt || '').slice(0, 4),
  };
}

export function detectChanges(
  projectDir: string,
  templateDir: string,
  manifest: Manifest,
): { added: string[]; modified: string[]; userModified: string[]; deleted: string[] } {
  const excludedPaths = manifest.excludedPaths || [];
  const adoptedMergedPaths = manifest.excludedPaths && manifest.excludedPaths.length > 0
    ? ['AGENTS.md', '.gitignore', 'opencode.json', '.opencode/opencode.json', '.opencode/templates/**']
    : [];
  const ignoredPaths = [...excludedPaths, ...adoptedMergedPaths];
  const templateFiles = collectFiles(templateDir, templateDir).filter((file) => !ignoredPaths.some((pattern) => {
    const normalizedFile = file.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');
    return normalizedPattern.endsWith('/**')
      ? normalizedFile === normalizedPattern.slice(0, -3) || normalizedFile.startsWith(normalizedPattern.slice(0, -2))
      : normalizedFile === normalizedPattern;
  }));

  const added: string[] = [];
  const modified: string[] = [];
  const userModified: string[] = [];
  const deleted: string[] = [];

  const manifestFileMap = new Map<string, string>();
  for (const f of manifest.files) {
    manifestFileMap.set(f.path, f.hash);
  }

  const templateSet = new Set(templateFiles);

  // The manifest stores the hash of the file as it exists in the project, which is the
  // substituted form. Reconstruct the variables the project was created with so the
  // comparison is apples to apples; otherwise every placeholder-bearing file is reported
  // as modified on every run, and a freshly created project looks permanently stale.
  const templateOptions = templateOptionsFromManifest(manifest);

  for (const file of templateFiles) {
    const templatePath = join(templateDir, file);
    const templateHash = hashTemplateFile(templatePath, templateOptions);
    const projectPath = join(projectDir, file);

    const manifestHash = manifestFileMap.get(file);

    if (!manifestHash) {
      added.push(file);
    } else if (templateHash !== manifestHash) {
      if (existsSync(projectPath)) {
        const currentHash = hashFile(projectPath);
        if (currentHash === manifestHash) {
          modified.push(file);
        } else {
          userModified.push(file);
        }
      } else {
        userModified.push(file);
      }
    }
  }

  for (const f of manifest.files) {
    if (!templateSet.has(f.path)) {
      deleted.push(f.path);
    }
  }

  return { added, modified, userModified, deleted };
}
