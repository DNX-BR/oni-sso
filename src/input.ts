import {
  input, password, select, confirm,
} from '@inquirer/prompts';
import type { Role } from './types.js';

export interface AccountChoice {
  account: string;
  id: string;
}

// Cache em processo: prompts são feitos sob demanda (lazy) e apenas uma vez.
// Assim, em dispositivo confiável (SSO), nada é pedido se os campos não aparecem.
let cachedEmail: string | undefined;
let cachedPassword: string | undefined;

export async function getEmail(): Promise<string> {
  if (process.env.ONI_USERNAME) return process.env.ONI_USERNAME;
  if (cachedEmail === undefined) cachedEmail = await input({ message: 'Enter a email:' });
  return cachedEmail;
}

export async function getPassword(): Promise<string> {
  if (process.env.ONI_PASSWORD) return process.env.ONI_PASSWORD;
  if (cachedPassword === undefined) cachedPassword = await password({ message: 'Enter a password:', mask: true });
  return cachedPassword;
}

export function selectRole(roles: Role[]): Promise<string> {
  return select({
    message: 'What is your role?',
    choices: roles.map((r) => ({ name: r.role, value: r.role })),
  });
}

export function selectAccount(accounts: AccountChoice[]): Promise<string> {
  return select({
    message: 'Choose an account:',
    choices: accounts.map((a) => ({ name: a.account, value: a.account })),
  });
}

export function getMFAGoogle(): Promise<string> {
  return input({ message: 'Input MFA Code:' });
}

export function getConfirmCelAccept(): Promise<boolean> {
  return confirm({ message: 'Did you confirm authentication on your smartphone?' });
}
