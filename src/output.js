const fs = require('fs');
const ini = require('ini');

async function FormatProfile(credentials, profile) {
  const config = await ini.parse(fs.readFileSync('/profile/credentials', 'utf-8'));
  config[profile] = {
    aws_access_key_id: credentials.AccessKeyId,
    aws_secret_access_key: credentials.SecretAccessKey,
    aws_session_token: credentials.SessionToken,
    aws_session_expiration: credentials.Expiration ? credentials.Expiration.toISOString() : '',
    region: process.env.AWS_DEFAULT_REGION ? process.env.AWS_DEFAULT_REGION : 'us-east-1',
  };
  await fs.writeFileSync('/profile/credentials', ini.stringify(config));
}

async function FormatEnv(credentials) {
  await fs.writeFileSync('/work/.env.auth', `AWS_ACCESS_KEY_ID=${credentials.AccessKeyId}
    AWS_SECRET_ACCESS_KEY=${credentials.SecretAccessKey}
    AWS_SESSION_TOKEN=${credentials.SessionToken}
    AWS_SESSION_EXPIRATION=${credentials.Expiration.toISOString()}`, 'utf-8');
}

async function FormatOne(credentials) {
  await fs.writeFileSync('/one/secrets', `NONE=
AWS_ACCESS_KEY_ID=${credentials.AccessKeyId}
AWS_SECRET_ACCESS_KEY=${credentials.SecretAccessKey}
AWS_SESSION_TOKEN=${credentials.SessionToken}
AWS_SESSION_EXPIRATION=${credentials.Expiration ? credentials.Expiration.toISOString() : ''}`, 'utf-8');
}

async function TempCredentialsOutput(credentials) {
  await fs.writeFileSync('/work/.env.oni-auth', JSON.stringify(credentials), 'utf-8');
}
/* eslint-disable no-console */
async function FormatExport(credentials) {
  console.log(`export AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}"
export AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}"
export AWS_SESSION_TOKEN="${credentials.SessionToken}"
export AWS_SESSION_EXPIRATION="${credentials.Expiration ? credentials.Expiration.toISOString() : ''}"`);
}
/* eslint-disable no-console */

/* eslint-disable no-console */
async function FormatConsole(credentials) {
  console.log(`AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}"
AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}"
AWS_SESSION_TOKEN="${credentials.SessionToken}"
AWS_SESSION_EXPIRATION="${credentials.Expiration ? credentials.Expiration.toISOString() : ''}"`);
}
/* eslint-disable no-console */

async function OutputFormat(format, credentials, profile) {
  switch (format) {
    case 'console':
      await FormatConsole(credentials);
      break;
    case 'one':
      await FormatOne(credentials);
      break;
    case 'export':
      await FormatExport(credentials);
      break;
    case 'env':
      await FormatEnv(credentials);
      break;
    case 'profile':
      await FormatProfile(credentials, profile);
      break;
    default:
      break;
  }
}

module.exports = {
  OutputFormat, TempCredentialsOutput,
};
