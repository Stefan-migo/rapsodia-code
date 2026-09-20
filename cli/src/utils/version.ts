import { readFileSync } from 'fs';
import { join } from 'path';

/** The built bundle lives in `cli/dist`, so `..` is the package root. */
export const CLI_VERSION: string = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;
