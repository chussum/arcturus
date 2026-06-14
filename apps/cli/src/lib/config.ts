import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Credentials saved by `arcturus login`, shared by every command. */
export interface CliConfig {
  serverUrl: string;
  token: string;
}

/** Per-project settings, read from arcturus.json in the project root. */
export interface ProjectConfig {
  name?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.arcturus');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function saveCliConfig(config: CliConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function loadCliConfig(): CliConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('Not logged in. Run: arcturus login --server http://<host>:7777 --token <token>');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as CliConfig;
}

export function loadProjectConfig(dir: string): ProjectConfig {
  const file = path.join(dir, 'arcturus.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectConfig;
}
