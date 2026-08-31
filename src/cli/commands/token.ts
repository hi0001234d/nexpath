import { password, isCancel } from '@clack/prompts';
import {
  storeNexpathToken,
  removeNexpathToken,
  readNexpathToken,
  isValidNexpathToken,
  resolveApiBaseUrl,
} from '../../config/NexpathTokenStore.js';

// Mirrors config.ts's API-key command shape exactly.

export type TokenPasswordFn = () => Promise<string | null>;

const defaultTokenPasswordFn: TokenPasswordFn = async () => {
  const input = await password({
    message:  'Nexpath token:',
    validate: (value) => {
      if (!isValidNexpathToken(value)) return 'Invalid Nexpath token format (expected npk_...)';
      return undefined;
    },
  });
  if (isCancel(input)) return null;
  return String(input);
};

export interface ConfigTokenOpts {
  projectRoot?: string;
  passwordFn?:  TokenPasswordFn;
  output?:      (line: string) => void;
}

const defaultPrint = (line: string): void => { console.log(line); };

// Mode B disclosure: a factual statement of what actually happens, not a
// marketing line, and pending final wording approval from the project's public
// docs. ⛔ Never claims "nothing leaves your machine": in Mode B, prompt
// context genuinely does leave the machine, and saying otherwise would be
// untrue. The host is read from whatever is actually configured
// (resolveApiBaseUrl), not a hardcoded string, so the sentence is always
// accurate to the real destination rather than a placeholder that could drift
// from it.
export function modeBDisclosureLine(): string {
  const host = resolveApiBaseUrl();
  return `With no OpenAI API key configured, prompt context will be sent to ${host} to be answered. This service stores no prompt text.`;
}

export async function configSetTokenAction(opts: ConfigTokenOpts = {}): Promise<void> {
  const print      = opts.output     ?? defaultPrint;
  const passwordFn = opts.passwordFn ?? defaultTokenPasswordFn;

  const token = await passwordFn();
  if (token === null || token === '') {
    print('Cancelled — no Nexpath token stored.');
    return;
  }

  const result = await storeNexpathToken(token);
  print(`✓ Nexpath token stored in ${result.source}`);
  print(modeBDisclosureLine());
}

export async function configRemoveTokenAction(opts: ConfigTokenOpts = {}): Promise<void> {
  const print = opts.output ?? defaultPrint;

  // ⚠️ Checked directly via readNexpathToken(), not getKeySource(): a token can
  // be stored while shadowed by a higher-priority OpenAI key (env/dotenv/
  // keychain/file), in which case getKeySource() would report that layer
  // instead and this message would wrongly say "nothing was stored".
  const hadToken = (await readNexpathToken()) !== null;
  await removeNexpathToken();
  if (hadToken) {
    print('✓ Nexpath token removed.');
  } else {
    print('No Nexpath token was stored.');
  }
}
