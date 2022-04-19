const { GetUsernamePassword, SelectRole } = require('./input');
const { LoginGoogleSSO } = require('./google');
const { LoginAzureSSO } = require('./azure');
const { LoginAWSSO } = require('./aws-sso');
const { AssumeRoleAWSSAML, AssumeRole } = require('./aws');
const { OutputFormat } = require('./output');

async function init() {
  /* eslint-disable global-require */
  const { argv } = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: oni-sso [options]')
    .command(
      'auth-google [options]',
      'Command for login by Google SSO',
      (yargs) => yargs.option('idpid', {
        alias: 'i',
        type: 'string',
        required: false,
        description: 'Google idpid',
      })
        .option('spid', {
          alias: 's',
          type: 'string',
          required: false,
          description: 'Google spid',
        })
        .option('output-format', {
          alias: 'o',
          type: 'string',
          required: false,
          description: 'Credentials output format',
          choices: ['console', 'one', 'env', 'export', 'profile'],
          default: 'console',
        })
        .option('duration-seconds', {
          alias: 'd',
          type: 'number',
          required: false,
          description: 'AWS Session duration in seconds',
          default: 3600,
        })
        .option('profile-name', {
          alias: 'p',
          type: 'string',
          required: false,
          description: 'AWS profile name',
          default: 'default',
        })
        .strictOptions(),
    )
    .command(
      'auth-azure [options]',
      'Command for login by Azure SSO',
      (yargs) => yargs.option('app-id-uri', {
        alias: 'a',
        type: 'string',
        required: false,
        description: 'Google idpid',
      })
        .option('tenant-id', {
          alias: 't',
          type: 'string',
          required: false,
          description: 'Google spid',
        })
        .option('output-format', {
          alias: 'o',
          type: 'string',
          required: false,
          description: 'Credentials output format',
          choices: ['console', 'one', 'env', 'export', 'profile'],
        })
        .option('duration-seconds', {
          alias: 'd',
          type: 'number',
          required: false,
          description: 'AWS Session duration in seconds',
          default: 3600,
        })
        .option('profile-name', {
          alias: 'p',
          type: 'string',
          required: false,
          description: 'AWS profile name',
          default: 'default',
        })
        .strictOptions(),
    )
    .command(
      'auth-aws [options]',
      'Command for login by AWS SSO',
      (yargs) => yargs.option('url', {
        alias: 'u',
        type: 'string',
        required: true,
        description: 'The ssoStartUrl',
      })
        .option('output-format', {
          alias: 'o',
          type: 'string',
          required: false,
          description: 'Credentials output format',
          choices: ['console', 'one', 'env', 'export', 'profile'],
        })
        .option('identity-source', {
          alias: 'i',
          type: 'string',
          required: false,
          description: 'Identy source provider',
          choices: ['aws'],
          default: 'aws',
        })
        .option('profile-name', {
          alias: 'p',
          type: 'string',
          required: false,
          description: 'AWS profile name',
          default: 'default',
        })
        .strictOptions(),
    )
    .command('assume-role [options]', 'Command for assume role', (yargs) => yargs.option('role', {
      alias: 'r',
      type: 'string',
      required: true,
      description: 'Role ARN',
    })
      .option('output-format', {
        alias: 'o',
        type: 'string',
        required: false,
        choices: ['console', 'one', 'env', 'export', 'profile'],
        default: 'console',
        description: 'Credentials export format',
      })
      .option('duration-seconds', {
        alias: 'd',
        type: 'number',
        required: false,
        description: 'AWS Session duration in seconds',
        default: 3600,
      })
      .option('profile-name', {
        alias: 'p',
        type: 'string',
        required: false,
        description: 'AWS profile name',
        default: 'default',
      }))
    .version('version', 'Show Version', `Version ${process.env.APP_VERSION || '0.0.1'}`)
    .alias('version', 'v')
    .demandCommand(1, 'You need at least one command')
    .help()
    .recommendCommands()
    .strictCommands();
  /* eslint-disable global-require */

  const command = argv._;
  let cred;
  let config;
  let roleSelected;
  let inputs;
  /* eslint-disable no-console */
  switch (command[0]) {
    case 'auth-google':
      console.log('Login Google SSO ');
      inputs = await GetUsernamePassword();
      config = await LoginGoogleSSO(inputs.email, inputs.password, argv.i, argv.s);
      roleSelected = await SelectRole(config.roles);
      cred = await AssumeRoleAWSSAML(config.saml, config.roles, roleSelected.role, argv.d);
      if (argv.o) await OutputFormat(argv.o, cred, argv.p);
      break;
    case 'auth-azure':
      console.log('Login Azure SSO ');
      inputs = await GetUsernamePassword();
      config = await LoginAzureSSO(inputs.email, inputs.password, argv.a, argv.t);
      roleSelected = await SelectRole(config.roles);
      cred = await AssumeRoleAWSSAML(config.saml, config.roles, roleSelected.role, argv.d);
      if (argv.o) await OutputFormat(argv.o, cred, argv.p);
      break;
    case 'auth-aws':
      console.log('Login AWS SSO '); /* eslint-disable no-console */
      inputs = await GetUsernamePassword();
      cred = await LoginAWSSO(inputs.email, inputs.password, argv.u);
      if (argv.o) await OutputFormat(argv.o, cred, argv.p);
      break;
    case 'assume-role':
      cred = await AssumeRole(argv.r, argv.d);
      await OutputFormat(argv.o, cred, argv.p);
      break;
    default:
      break;
  }
/* eslint-disable no-console */
}

init();
