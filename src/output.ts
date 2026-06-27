import fs from 'node:fs';
import path from 'node:path';
import ini from 'ini';
import type { Credentials, OutputFormatName } from './types.js';

// Caminhos de saída. Defaults são os pontos de montagem do container; podem ser
// redirecionados por env para rodar localmente (fora do Docker).
const WORK_DIR = process.env.ONI_WORK_DIR ?? '/work';
const PROFILE_FILE = process.env.ONI_PROFILE_FILE ?? '/profile/credentials';
const ONE_FILE = process.env.ONI_ONE_FILE ?? '/one/secrets';

export const ONI_AUTH_FILE = path.join(WORK_DIR, '.env.oni-auth');
const ENV_AUTH_FILE = path.join(WORK_DIR, '.env.auth');

function ensureDir(file: string): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const region = (): string => process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
const iso = (date?: Date): string => (date ? date.toISOString() : '');

async function formatProfile(credentials: Credentials, profile: string): Promise<void> {
  ensureDir(PROFILE_FILE);
  const config = fs.existsSync(PROFILE_FILE)
    ? ini.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'))
    : {};
  config[profile] = {
    aws_access_key_id: credentials.AccessKeyId,
    aws_secret_access_key: credentials.SecretAccessKey,
    aws_session_token: credentials.SessionToken,
    aws_session_expiration: iso(credentials.Expiration),
    region: region(),
  };
  fs.writeFileSync(PROFILE_FILE, ini.stringify(config));
}

async function formatEnv(credentials: Credentials): Promise<void> {
  ensureDir(ENV_AUTH_FILE);
  fs.writeFileSync(ENV_AUTH_FILE, `AWS_ACCESS_KEY_ID=${credentials.AccessKeyId}
AWS_SECRET_ACCESS_KEY=${credentials.SecretAccessKey}
AWS_SESSION_TOKEN=${credentials.SessionToken}
AWS_SESSION_EXPIRATION=${iso(credentials.Expiration)}`, 'utf-8');
}

async function formatOne(credentials: Credentials): Promise<void> {
  ensureDir(ONE_FILE);
  fs.writeFileSync(ONE_FILE, `NONE=
AWS_ACCESS_KEY_ID=${credentials.AccessKeyId}
AWS_SECRET_ACCESS_KEY=${credentials.SecretAccessKey}
AWS_SESSION_TOKEN=${credentials.SessionToken}
AWS_SESSION_EXPIRATION=${iso(credentials.Expiration)}`, 'utf-8');
}

export async function tempCredentialsOutput(credentials: Credentials): Promise<void> {
  ensureDir(ONI_AUTH_FILE);
  fs.writeFileSync(ONI_AUTH_FILE, JSON.stringify(credentials), 'utf-8');
}

function formatExport(credentials: Credentials): void {
  console.log(`export AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}"
export AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}"
export AWS_SESSION_TOKEN="${credentials.SessionToken}"
export AWS_SESSION_EXPIRATION="${iso(credentials.Expiration)}"`);
}

function formatConsole(credentials: Credentials): void {
  console.log(`AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}"
AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}"
AWS_SESSION_TOKEN="${credentials.SessionToken}"
AWS_SESSION_EXPIRATION="${iso(credentials.Expiration)}"`);
}

export async function outputFormat(
  format: OutputFormatName,
  credentials: Credentials,
  profile: string,
): Promise<void> {
  switch (format) {
    case 'console':
      formatConsole(credentials);
      break;
    case 'one':
      await formatOne(credentials);
      break;
    case 'export':
      formatExport(credentials);
      break;
    case 'env':
      await formatEnv(credentials);
      break;
    case 'profile':
      await formatProfile(credentials, profile);
      break;
    default:
      break;
  }
}
