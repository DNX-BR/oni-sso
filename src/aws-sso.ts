import {
  SSOOIDCClient,
  RegisterClientCommand,
  StartDeviceAuthorizationCommand,
  CreateTokenCommand,
} from '@aws-sdk/client-sso-oidc';
import {
  SSOClient,
  ListAccountsCommand,
  ListAccountRolesCommand,
  GetRoleCredentialsCommand,
  type AccountInfo,
  type RoleInfo,
} from '@aws-sdk/client-sso';
import { select } from '@inquirer/prompts';
import { sleep, fatal } from './browser.js';
import { tempCredentialsOutput } from './output.js';
import type { Credentials } from './types.js';

const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

const ssoRegion = (): string => process.env.SSO_REGION
  ?? process.env.AWS_DEFAULT_REGION
  ?? 'us-east-1';

// Faz login no AWS IAM Identity Center usando o fluxo oficial de device
// authorization (OIDC), sem raspar o portal HTML.
export async function loginAWSSO(startUrl: string): Promise<Credentials> {
  const region = ssoRegion();
  const oidc = new SSOOIDCClient({ region });

  const registered = await oidc.send(new RegisterClientCommand({
    clientName: 'oni-sso',
    clientType: 'public',
  }));

  const auth = await oidc.send(new StartDeviceAuthorizationCommand({
    clientId: registered.clientId,
    clientSecret: registered.clientSecret,
    startUrl,
  }));

  console.log('\nTo authorize this session, open the following URL in your browser:');
  console.log(`  ${auth.verificationUriComplete ?? auth.verificationUri}`);
  console.log(`  and confirm the code: ${auth.userCode}\n`);

  // Faz polling do token até o usuário aprovar (ou o código expirar).
  const intervalMs = (auth.interval ?? 5) * 1000;
  const deadline = Date.now() + (auth.expiresIn ?? 600) * 1000;
  let accessToken: string | undefined;

  while (!accessToken) {
    if (Date.now() > deadline) {
      fatal('Device authorization expired before approval.');
    }
    await sleep(intervalMs);
    try {
      const token = await oidc.send(new CreateTokenCommand({
        clientId: registered.clientId,
        clientSecret: registered.clientSecret,
        grantType: GRANT_TYPE,
        deviceCode: auth.deviceCode,
      }));
      accessToken = token.accessToken;
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'AuthorizationPendingException' || name === 'SlowDownException') {
        continue;
      }
      throw err;
    }
  }

  const sso = new SSOClient({ region });

  const accountsResp = await sso.send(new ListAccountsCommand({ accessToken }));
  const accounts: AccountInfo[] = accountsResp.accountList ?? [];
  if (accounts.length === 0) {
    fatal('No accounts available for this AWS SSO session.');
  }

  const accountId = await select({
    message: 'Choose an account:',
    choices: accounts.map((a) => ({
      name: `${a.accountName ?? a.accountId} (${a.accountId})`,
      value: a.accountId as string,
    })),
  });

  const rolesResp = await sso.send(new ListAccountRolesCommand({ accessToken, accountId }));
  const roles: RoleInfo[] = rolesResp.roleList ?? [];
  if (roles.length === 0) {
    fatal('No roles available for the selected account.');
  }

  const roleName = await select({
    message: 'What is your role?',
    choices: roles.map((r) => ({ name: r.roleName as string, value: r.roleName as string })),
  });

  const roleCreds = await sso.send(new GetRoleCredentialsCommand({
    accessToken,
    accountId,
    roleName,
  }));

  const rc = roleCreds.roleCredentials;
  if (!rc) {
    fatal('Could not retrieve role credentials.');
  }

  const credentials: Credentials = {
    AccessKeyId: rc.accessKeyId,
    SecretAccessKey: rc.secretAccessKey,
    SessionToken: rc.sessionToken,
    Expiration: rc.expiration ? new Date(rc.expiration) : undefined,
  };

  await tempCredentialsOutput(credentials);
  return credentials;
}
