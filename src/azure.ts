import util from 'node:util';
import zlib from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { getEmail, getPassword, getConfirmCelAccept } from './input.js';
import {
  sleep, waitUntil, openSession, dumpFailure, fatal, clearFolder, diagPath, DIAG_DIR,
} from './browser.js';
import { decodeSaml, getRoles } from './saml.js';
import type { SamlLoginResult } from './types.js';

const deflate = util.promisify(zlib.deflateRaw);

// Mapeia nomes amigáveis para o `credType` do Azure AD (enum estável, usado no
// atributo data-test-cred-id dos tiles do seletor de métodos).
const CRED_TYPE: Record<string, string> = {
  Password: '1',
  PhoneAppNotification: '2', // push do Microsoft Authenticator (number matching)
  PhoneAppOTP: '3', // código TOTP do Authenticator
  OneWaySMS: '4',
};

// Script injetado para neutralizar WebAuthn: a tela de passkey/FIDO falha
// sozinha (sem o diálogo do SO), caindo direto no fallback "Entrar de outra forma".
const DISABLE_WEBAUTHN = 'try { if (navigator.credentials) { navigator.credentials.get = () => Promise.reject(new DOMException("passkey disabled by oni-sso", "NotAllowedError")); } } catch (e) {}';

export async function loginAzureSSO(
  inputAppIdUri?: string,
  inputTenantId?: string,
  monitor = false,
): Promise<SamlLoginResult> {
  const appIdUri = inputAppIdUri ?? process.env.AZURE_APP_ID_URI;
  const tenantId = inputTenantId ?? process.env.TENANT_ID;
  const timeoutPage = Number(process.env.TIMEOUT_PAGE ?? 5000);
  const authTimeout = Number(process.env.AUTH_TIMEOUT ?? 60000);

  if (!appIdUri || !tenantId) {
    fatal('appIdUri or tenantId not found');
  }

  clearFolder(DIAG_DIR);

  const samlRequest = `
    <samlp:AuthnRequest xmlns="urn:oasis:names:tc:SAML:2.0:metadata" ID="id${randomUUID()}" Version="2.0" IssueInstant="${new Date().toISOString()}" IsPassive="false" AssertionConsumerServiceURL="https://signin.aws.amazon.com/saml" xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
        <Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">${appIdUri}</Issuer>
        <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"></samlp:NameIDPolicy>
    </samlp:AuthnRequest>
  `;
  const samlBase64 = (await deflate(samlRequest)).toString('base64');
  const url = `https://login.microsoftonline.com/${tenantId}/saml2?SAMLRequest=${encodeURIComponent(samlBase64)}`;

  let samlResponse = '';
  const session = await openSession('azure');
  const { page } = session;

  const shot = async (name: string): Promise<void> => {
    if (monitor) await page.screenshot({ path: diagPath(`${name}.png`) });
  };

  try {
    await session.addInitScript(DISABLE_WEBAUTHN);

    page.on('request', (request) => {
      if (request.url() === 'https://signin.aws.amazon.com/saml') {
        samlResponse = (request.postData() ?? '')
          .replace('SAMLResponse=', '')
          .replace('&RelayState=', '');
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await shot('initial-page');

    // Fluxo adaptável: trata cada tela conforme aparece (email, passkey, seletor
    // de método, senha) até chegar ao MFA ou capturar o SAML. Email/senha são
    // pedidos só quando os campos surgem; em dispositivo confiável, nada é pedido.
    const methodName = process.env.AZURE_AUTH_METHOD ?? 'PhoneAppNotification';
    const desiredCredType = CRED_TYPE[methodName] ?? methodName;
    const stateDeadline = Date.now() + authTimeout;
    let emailFilled = false;
    let passwordFilled = false;
    let switchClicked = false;
    let methodPicked = false;
    let numberMfa: string | null = null;

    while (Date.now() < stateDeadline && !samlResponse) {
      // Desafio de MFA presente? Para de navegar e entrega o controle ao usuário.
      const sign = page.locator('#idRichContext_DisplaySign');
      if (await sign.count() > 0) {
        // O número pode renderizar vazio antes de popular (mais comum em
        // headless/container); aguarda o texto aparecer antes de ler.
        for (let i = 0; i < 20 && !numberMfa; i += 1) {
          const text = (await sign.textContent())?.trim();
          if (text) {
            numberMfa = text;
            break;
          }
          await sleep(500);
        }
        break;
      }
      if (await page.locator('#idDiv_SAOTCAS_Title').count() > 0) break;

      // Campo de email.
      const emailField = page.locator('input[type="email"]').first();
      if (!emailFilled && await emailField.count() > 0 && await emailField.isVisible().catch(() => false)) {
        await emailField.fill(await getEmail());
        await page.keyboard.press('Enter');
        emailFilled = true;
        await sleep(timeoutPage);
        continue;
      }

      // Tela de passkey/FIDO -> "Entrar de outra forma" (no máximo uma vez, para
      // não ciclar: esse link também existe na própria tela de MFA).
      const switchLink = page.locator('#idA_PWD_SwitchToCredPicker');
      if (!switchClicked && await switchLink.count() > 0) {
        await switchLink.first().click().catch(() => undefined);
        switchClicked = true;
        await sleep(timeoutPage);
        continue;
      }

      // Seletor de métodos -> tile do método desejado (no máximo uma vez).
      if (!methodPicked) {
        const tile = page.locator(`[data-test-cred-id="${desiredCredType}"]`);
        if (await tile.count() > 0) {
          await tile.first().click().catch(() => undefined);
          methodPicked = true;
          await sleep(timeoutPage);
          continue;
        }
      }

      // Campo de senha (somente em contas com senha).
      const pwd = page.locator('input[type="password"]').first();
      if (!passwordFilled && await pwd.count() > 0 && await pwd.isVisible().catch(() => false)) {
        await pwd.fill(await getPassword());
        await page.keyboard.press('Enter');
        passwordFilled = true;
        await sleep(timeoutPage);
        continue;
      }

      await sleep(1500);
    }

    const mfaExists = await page.locator('#idDiv_SAOTCAS_Title').count() > 0;
    await shot('post-mfa');

    if (numberMfa || mfaExists) {
      if (numberMfa) {
        console.log(`\x1b[1mPut the value in app:\x1b[0m ${numberMfa}`);
      } else {
        console.log('Approve the sign-in request on your authenticator app.');
      }

      const status = await getConfirmCelAccept();
      if (!status) {
        await dumpFailure(page, 'azure-mfa-not-confirmed');
        fatal('You did not confirm authentication');
      }

      await shot('pre-stay-signed');
      // "Continuar conectado?" (kmsi): tenta o submit padrão e, como fallback,
      // o botão "Sim" (#idSIButton9), para concluir e disparar o POST do SAML.
      const staySigned = page.locator('div.win-scroll input[type="submit"], #idSIButton9');
      try {
        await staySigned.first().waitFor({ timeout: 10000 });
        await staySigned.first().click();
        await sleep(timeoutPage);
        await shot('post-stay-signed');
      } catch {
        /* tela "continuar conectado?" não apareceu */
      }
    }

    // Aguarda o POST do SAML para a AWS ser capturado (após login/MFA).
    await waitUntil(() => !!samlResponse, authTimeout);

    if (!samlResponse) {
      await dumpFailure(page, 'azure-no-saml');
      fatal('SAMLResponse not found!');
    }
  } finally {
    await session.close();
  }

  const saml = decodeSaml(samlResponse);
  return { saml, roles: getRoles(saml) };
}
