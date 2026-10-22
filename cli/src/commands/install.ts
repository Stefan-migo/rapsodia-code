import { checkDeps } from '../engine/deps';
import { info, success, warn, error, heading } from '../utils/logger';

interface InstallOptions {
  check?: boolean;
}

export async function installCommand(options: InstallOptions): Promise<void> {
  heading('Rapsodia Dependency Check');

  const deps = checkDeps();
  let allOk = true;

  for (const dep of deps) {
    if (dep.installed) {
      const version = dep.version ? ` (${dep.version})` : '';
      success(`${dep.name}${version}`);
    } else {
      allOk = false;
      error(`${dep.name} — not found`);
    }
  }

  heading('Summary');
  const installed = deps.filter((d) => d.installed).length;
  const total = deps.length;

  if (installed === total) {
    success(`All ${total} dependencies are installed`);
  } else {
    warn(`${installed}/${total} dependencies installed`);
  }

  if (allOk) {
    info('Everything looks good. Run `gentle-shell` to start.');
    return;
  }

  if (options.check) {
    info('Run `rapso install` (without --check) to print the installation steps.');
    return;
  }

  heading('Missing Dependencies — Installation Steps');

  for (const dep of deps) {
    if (dep.installed) continue;

    info(`To install ${dep.name}:`);

    switch (dep.name) {
      case 'Engram':
        info('  Run: npm install -g engram');
        break;
      case 'Graphify':
        info('  Run: pip install graphifyy');
        break;
      case 'Node.js':
        info('  Download from: https://nodejs.org (>= 18 required)');
        break;
    }
  }
}
