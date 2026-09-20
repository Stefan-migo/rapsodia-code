import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { step, info, success, warn, error, heading } from '../utils/logger';
import { hashFile, collectFiles, projectTemplateFile } from '../engine/template';
import { detectChanges, Manifest, templateOptionsFromManifest } from '../engine/manifest';
import * as readline from 'readline';
import { resolveStatePath } from '../utils/state';

interface UpdateOptions {
  dryRun?: boolean;
  force?: boolean;
  check?: boolean;
}

interface UpdateResult {
  updated: string[];
  skipped: string[];
  added: string[];
  errors: string[];
}

const TEMPLATE_DIR = join(__dirname, '..', 'src', 'template');

function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

function showDiff(projectPath: string, templatePath: string): void {
  const projectContent = existsSync(projectPath) ? readFileSync(projectPath, 'utf-8') : '';
  const templateContent = readFileSync(templatePath, 'utf-8');

  const projectLines = projectContent.split('\n');
  const templateLines = templateContent.split('\n');

  const maxLines = Math.max(projectLines.length, templateLines.length);
  let diffCount = 0;

  for (let i = 0; i < maxLines; i++) {
    if (projectLines[i] !== templateLines[i]) {
      if (diffCount < 10) {
        if (i < projectLines.length) {
          console.log(`  -${projectLines[i]}`);
        }
        if (i < templateLines.length) {
          console.log(`  +${templateLines[i]}`);
        }
      }
      diffCount++;
    }
  }

  if (diffCount > 10) {
    info(`... and ${diffCount - 10} more differences`);
  }
}

export async function updateCommand(options: UpdateOptions): Promise<void> {
  heading('Rapsodia Update');

  const projectDir = process.cwd();
  const manifestPath = resolveStatePath(projectDir, 'manifest.json');

  if (!manifestPath || !existsSync(manifestPath)) {
    error('No Rapsodia manifest found. Are you in a Rapsodia project directory?');
    process.exit(1);
  }

  if (!existsSync(TEMPLATE_DIR)) {
    error(`Template directory not found at ${TEMPLATE_DIR}`);
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    error('Failed to read manifest.json');
    process.exit(1);
  }

  const templateOptions = templateOptionsFromManifest(manifest);

  step('Comparing template with project');
  const changes = detectChanges(projectDir, TEMPLATE_DIR, manifest);

  if (options.check) {
    info(`Template version: ${manifest.templateVersion}`);
    info(`Files tracked: ${manifest.files.length}`);
    if (changes.added.length > 0) {
      warn(`${changes.added.length} new file(s) available`);
    }
    if (changes.modified.length > 0) {
      info(`${changes.modified.length} file(s) have auto-updates pending`);
    }
    if (changes.userModified.length > 0) {
      warn(`${changes.userModified.length} file(s) modified by user need review`);
    }
    if (changes.deleted.length > 0) {
      warn(`${changes.deleted.length} file(s) removed from template (not deleted from project)`);
    }
    if (changes.added.length === 0 && changes.modified.length === 0 && changes.userModified.length === 0) {
      success('Template is up to date');
    }
    return;
  }

  if (changes.added.length === 0 && changes.modified.length === 0 && changes.userModified.length === 0) {
    success('Template is already up to date');
    return;
  }

  heading('Changes Detected');

  if (changes.added.length > 0) {
    info(`New files (${changes.added.length}):`);
    for (const f of changes.added) {
      info(`  + ${f}`);
    }
  }

  if (changes.modified.length > 0) {
    info(`Auto-updatable files (${changes.modified.length}):`);
    for (const f of changes.modified) {
      info(`  ~ ${f}`);
    }
  }

  if (changes.userModified.length > 0) {
    warn(`User-modified files (${changes.userModified.length}):`);
    for (const f of changes.userModified) {
      warn(`  ! ${f}`);
    }
  }

  if (changes.deleted.length > 0) {
    warn(`Removed from template (${changes.deleted.length}):`);
    for (const f of changes.deleted) {
      warn(`  - ${f} (not deleted from project)`);
    }
  }

  if (options.dryRun) {
    info('');
    info('Dry run — no changes applied.');
    return;
  }

  console.log('');

  const result: UpdateResult = {
    updated: [],
    skipped: [],
    added: [],
    errors: [],
  };

  const templateFiles = collectFiles(TEMPLATE_DIR, TEMPLATE_DIR);

  for (const file of changes.modified) {
    const templatePath = join(TEMPLATE_DIR, file);
    const projectPath = join(projectDir, file);
    try {
      writeFileSync(projectPath, projectTemplateFile(templatePath, templateOptions));
      result.updated.push(file);
      success(`Updated: ${file}`);
    } catch (e: any) {
      result.errors.push(file);
      error(`Failed to update ${file}: ${e.message}`);
    }
  }

  for (const file of changes.userModified) {
    const proceed = options.force || await promptYesNo(`Overwrite "${file}" (user-modified)?`);
    if (proceed) {
      const templatePath = join(TEMPLATE_DIR, file);
      const projectPath = join(projectDir, file);
      try {
        writeFileSync(projectPath, projectTemplateFile(templatePath, templateOptions));
        result.updated.push(file);
        success(`Overwritten: ${file}`);
      } catch (e: any) {
        result.errors.push(file);
        error(`Failed to overwrite ${file}: ${e.message}`);
      }
    } else {
      result.skipped.push(file);
      info(`Skipped: ${file}`);
    }
  }

  for (const file of changes.added) {
    const proceed = options.force || await promptYesNo(`Add new file "${file}"?`);
    if (proceed) {
      const templatePath = join(TEMPLATE_DIR, file);
      const projectPath = join(projectDir, file);
      try {
        const parentDir = join(projectPath, '..');
        if (!existsSync(parentDir)) {
          const { mkdirSync } = require('fs');
          mkdirSync(parentDir, { recursive: true });
        }
        writeFileSync(projectPath, projectTemplateFile(templatePath, templateOptions));
        result.added.push(file);
        success(`Added: ${file}`);
      } catch (e: any) {
        result.errors.push(file);
        error(`Failed to add ${file}: ${e.message}`);
      }
    } else {
      info(`Skipped: ${file}`);
    }
  }

  step('Updating manifest');
  const updatedFiles = [...manifest.files];
  const updatedPaths = new Set(updatedFiles.map((f) => f.path));

  for (const file of result.updated) {
    const idx = updatedFiles.findIndex((f) => f.path === file);
    const projectPath = join(projectDir, file);
    if (idx !== -1 && existsSync(projectPath)) {
      updatedFiles[idx] = { path: file, hash: hashFile(projectPath) };
    }
  }

  for (const file of result.added) {
    if (!updatedPaths.has(file)) {
      const projectPath = join(projectDir, file);
      if (existsSync(projectPath)) {
        updatedFiles.push({ path: file, hash: hashFile(projectPath) });
      }
    }
  }

  const updatedManifest: Manifest = {
    ...manifest,
    templateVersion: '1.0.0',
    createdAt: manifest.createdAt,
    files: updatedFiles,
  };

  writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2), 'utf-8');
  success('Manifest updated');

  heading('Update Summary');
  if (result.updated.length > 0) success(`${result.updated.length} file(s) updated`);
  if (result.added.length > 0) success(`${result.added.length} file(s) added`);
  if (result.skipped.length > 0) info(`${result.skipped.length} file(s) skipped`);
  if (result.errors.length > 0) error(`${result.errors.length} error(s)`);
}
