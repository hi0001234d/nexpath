import { password, confirm, isCancel } from '@clack/prompts';
import { openStore, closeStore, DEFAULT_DB_PATH, getConfig, setConfig, deleteConfig } from '../../store/index.js';
import {
  ConfigValidationError,
  setAdvisoryFrequency,
  setRole,
} from '../shared/config-setters.js';
import {
  storeApiKey,
  removeApiKey,
  getKeySource,
  isValidApiKey,
} from '../../config/ApiKeyResolver.js';

export async function configGetAction(key: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  const value = getConfig(store.db, key);
  closeStore(store);

  if (value === undefined || value === '') {
    console.log(`${key} = (not set)`);
  } else {
    console.log(`${key} = ${value}`);
  }
}

export async function configSetAction(key: string, value: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  try {
    if (key === 'role' || key.startsWith('role:')) {
      setRole(store, key, value);
    } else if (key === 'advisory_frequency' || key.startsWith('advisory_frequency:')) {
      setAdvisoryFrequency(store, key, value);
    } else {
      setConfig(store, key, value);
    }
  } catch (err) {
    closeStore(store);
    if (err instanceof ConfigValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  closeStore(store);
  console.log(`${key} = ${value}`);
}

export async function configUnsetAction(key: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  deleteConfig(store, key);
  closeStore(store);
  console.log(`${key} unset`);
}

// ── API key management (Plan #1 Phase 5) ─────────────────────────────────────

export type ApiKeyPasswordFn = () => Promise<string | null>;
export type ApiKeyConfirmFn  = () => Promise<boolean>;

const defaultApiKeyPasswordFn: ApiKeyPasswordFn = async () => {
  const input = await password({
    message:  'OpenAI API Key:',
    validate: (value) => {
      if (!isValidApiKey(value)) return 'Invalid OpenAI API key format (expected sk-...)';
      return undefined;
    },
  });
  if (isCancel(input)) return null;
  return String(input);
};

const defaultRotateConfirmFn: ApiKeyConfirmFn = async () => {
  const answer = await confirm({
    message:      'Overwrite the existing API key?',
    initialValue: false,
  });
  return !isCancel(answer) && answer === true;
};

export interface ConfigApiKeyOpts {
  projectRoot?: string;
  passwordFn?:  ApiKeyPasswordFn;
  confirmFn?:   ApiKeyConfirmFn;
  output?:      (line: string) => void;
}

const defaultPrint = (line: string): void => { console.log(line); };

export async function configSetApiKeyAction(opts: ConfigApiKeyOpts = {}): Promise<void> {
  const print       = opts.output      ?? defaultPrint;
  const passwordFn  = opts.passwordFn  ?? defaultApiKeyPasswordFn;
  const key = await passwordFn();
  if (key === null || key === '') {
    print('Cancelled — no API key stored.');
    return;
  }
  const result = await storeApiKey(key);
  print(`✓ API key stored in ${result.source}`);
}

export async function configRotateApiKeyAction(opts: ConfigApiKeyOpts = {}): Promise<void> {
  const print       = opts.output      ?? defaultPrint;
  const passwordFn  = opts.passwordFn  ?? defaultApiKeyPasswordFn;
  const confirmFn   = opts.confirmFn   ?? defaultRotateConfirmFn;
  const projectRoot = opts.projectRoot ?? process.cwd();

  const currentSource = await getKeySource(projectRoot);
  if (currentSource === 'none') {
    print('Error: No existing API key to rotate. Use `nexpath config set-api-key` to store one first.');
    process.exitCode = 1;
    return;
  }

  print(`Existing API key is stored in ${currentSource}.`);
  const ok = await confirmFn();
  if (!ok) {
    print('Cancelled — existing API key retained.');
    return;
  }

  const key = await passwordFn();
  if (key === null || key === '') {
    print('Cancelled — existing API key retained.');
    return;
  }
  const result = await storeApiKey(key);
  print(`✓ API key rotated; new key stored in ${result.source} (was in ${currentSource})`);
}

export async function configShowKeySourceAction(opts: ConfigApiKeyOpts = {}): Promise<void> {
  const print       = opts.output      ?? defaultPrint;
  const projectRoot = opts.projectRoot ?? process.cwd();
  const source      = await getKeySource(projectRoot);
  print(`API key source: ${source}`);
}

export async function configRemoveApiKeyAction(opts: ConfigApiKeyOpts = {}): Promise<void> {
  const print       = opts.output      ?? defaultPrint;
  const projectRoot = opts.projectRoot ?? process.cwd();
  const sourceBefore = await getKeySource(projectRoot);
  await removeApiKey();
  if (sourceBefore === 'none') {
    print('No API key was stored.');
  } else {
    print(`✓ API key removed (was in ${sourceBefore}).`);
  }
}
