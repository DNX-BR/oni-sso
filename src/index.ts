#!/usr/bin/env node
import { Command } from 'commander';
import { selectRole } from './input.js';
import { loginGoogleSSO } from './google.js';
import { loginAzureSSO } from './azure.js';
import { loginAWSSO } from './aws-sso.js';
import { assumeRoleAWSSAML, assumeRole } from './aws.js';
import { outputFormat } from './output.js';
import type { OutputFormatName, SamlLoginResult } from './types.js';

const OUTPUT_CHOICES = ['console', 'one', 'env', 'export', 'profile'];

function parseDuration(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 3600;
}

async function runSamlLogin(
  config: SamlLoginResult,
  output: OutputFormatName | undefined,
  duration: number,
  profile: string,
): Promise<void> {
  const role = await selectRole(config.roles);
  const cred = await assumeRoleAWSSAML(config.saml, config.roles, role, duration);
  if (output) await outputFormat(output, cred, profile);
}

const program = new Command();

program
  .name('oni-sso')
  .description('CLI tool to login in AWS with Azure/Google SSO (SAML) and AWS SSO')
  .version(process.env.APP_VERSION ?? '3.0.0', '-v, --version', 'Show Version');

program
  .command('auth-google')
  .description('Command for login by Google SSO')
  .option('-i, --idpid <idpid>', 'Google idpid')
  .option('-s, --spid <spid>', 'Google spid')
  .option('-o, --output-format <format>', `Credentials output format (${OUTPUT_CHOICES.join(', ')})`, 'console')
  .option('-d, --duration-seconds <seconds>', 'AWS Session duration in seconds', parseDuration, 3600)
  .option('-p, --profile-name <name>', 'AWS profile name', 'default')
  .option('-m, --monitor', 'Take screenshots of auth steps', false)
  .action(async (opts) => {
    console.log('Login Google SSO');
    const config = await loginGoogleSSO(opts.idpid, opts.spid, opts.monitor);
    await runSamlLogin(config, opts.outputFormat, opts.durationSeconds, opts.profileName);
  });

program
  .command('auth-azure')
  .description('Command for login by Azure SSO')
  .option('-a, --app-id-uri <uri>', 'Azure app ID URI')
  .option('-t, --tenant-id <id>', 'Azure tenant ID')
  .option('-o, --output-format <format>', `Credentials output format (${OUTPUT_CHOICES.join(', ')})`, 'console')
  .option('-d, --duration-seconds <seconds>', 'AWS Session duration in seconds', parseDuration, 3600)
  .option('-p, --profile-name <name>', 'AWS profile name', 'default')
  .option('-m, --monitor', 'Take screenshots of auth steps', false)
  .action(async (opts) => {
    console.log('Login Azure SSO');
    const config = await loginAzureSSO(opts.appIdUri, opts.tenantId, opts.monitor);
    await runSamlLogin(config, opts.outputFormat, opts.durationSeconds, opts.profileName);
  });

program
  .command('auth-aws')
  .description('Command for login by AWS SSO (IAM Identity Center)')
  .requiredOption('-u, --url <url>', 'The ssoStartUrl')
  .option('-o, --output-format <format>', `Credentials output format (${OUTPUT_CHOICES.join(', ')})`, 'console')
  .option('-p, --profile-name <name>', 'AWS profile name', 'default')
  .action(async (opts) => {
    console.log('Login AWS SSO');
    const cred = await loginAWSSO(opts.url);
    if (opts.outputFormat) await outputFormat(opts.outputFormat, cred, opts.profileName);
  });

program
  .command('assume-role')
  .description('Command for assume role')
  .requiredOption('-r, --role <arn>', 'Role ARN')
  .option('-o, --output-format <format>', `Credentials output format (${OUTPUT_CHOICES.join(', ')})`, 'console')
  .option('-d, --duration-seconds <seconds>', 'AWS Session duration in seconds', parseDuration, 3600)
  .option('-p, --profile-name <name>', 'AWS profile name', 'default')
  .action(async (opts) => {
    const cred = await assumeRole(opts.role, opts.durationSeconds);
    await outputFormat(opts.outputFormat, cred, opts.profileName);
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
