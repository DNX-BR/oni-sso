const aws = require('@aws-sdk/client-sts');
const fs = require('fs');

const { TempCredentialsOutput } = require('./output');

async function AssumeRole(role, durationSeconds) {
  const credentials = JSON.parse(await fs.readFileSync('/work/.env.oni-auth', { encoding: 'utf-8' }));
  const datetime = Math.floor(new Date().getTime() / 1000);
  const assume = await new aws.STS({
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    },
  }).assumeRole({
    RoleArn: role,
    RoleSessionName: `Session-${datetime.toString()}`,
    DurationSeconds: durationSeconds,
  });

  return assume.Credentials;
}

async function AssumeRoleAWSSAML(saml, roles, roleSelected, durationSeconds) {
  const client = new aws.STSClient({ region: process.env.AWS_DEFAULT_REGION || 'us-east-1' });
  const assume = await new aws.AssumeRoleWithSAMLCommand({
    RoleArn: roleSelected,
    PrincipalArn: roles.filter((r) => { // eslint-disable-line  consistent-return, array-callback-return, max-len
      if (r.role === roleSelected) return 1;
    })[0].principal,
    SAMLAssertion: Buffer.from(saml).toString('base64'),
    DurationSeconds: durationSeconds,
  });

  const result = await client.send(assume);
  await TempCredentialsOutput(result.Credentials);
  return result.Credentials;
}

module.exports = {
  AssumeRoleAWSSAML, AssumeRole,
};
