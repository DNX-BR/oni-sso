import fs from 'node:fs';
import {
  STSClient,
  AssumeRoleCommand,
  AssumeRoleWithSAMLCommand,
} from '@aws-sdk/client-sts';
import { tempCredentialsOutput, ONI_AUTH_FILE } from './output.js';
import { fatal } from './browser.js';
import type { Credentials, Role } from './types.js';

const region = (): string => process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

export async function assumeRole(role: string, durationSeconds: number): Promise<Credentials> {
  if (!fs.existsSync(ONI_AUTH_FILE)) {
    fatal(`Credentials file not found at ${ONI_AUTH_FILE}. Run an auth-* command first to generate it.`);
  }
  const stored = JSON.parse(fs.readFileSync(ONI_AUTH_FILE, 'utf-8')) as Credentials;
  const datetime = Math.floor(Date.now() / 1000);

  const client = new STSClient({
    region: region(),
    credentials: {
      accessKeyId: stored.AccessKeyId ?? '',
      secretAccessKey: stored.SecretAccessKey ?? '',
      sessionToken: stored.SessionToken,
    },
  });

  const result = await client.send(new AssumeRoleCommand({
    RoleArn: role,
    RoleSessionName: `Session-${datetime}`,
    DurationSeconds: durationSeconds,
  }));

  return result.Credentials ?? {};
}

export async function assumeRoleAWSSAML(
  saml: string,
  roles: Role[],
  roleSelected: string,
  durationSeconds: number,
): Promise<Credentials> {
  const matched = roles.find((r) => r.role === roleSelected);
  if (!matched) {
    fatal('Selected role not found in the SAML assertion');
  }

  const client = new STSClient({ region: region() });
  const result = await client.send(new AssumeRoleWithSAMLCommand({
    RoleArn: roleSelected,
    PrincipalArn: matched.principal,
    SAMLAssertion: Buffer.from(saml).toString('base64'),
    DurationSeconds: durationSeconds,
  }));

  const credentials = result.Credentials ?? {};
  await tempCredentialsOutput(credentials);
  return credentials;
}
