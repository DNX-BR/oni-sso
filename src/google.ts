import { getEmail, getPassword, getMFAGoogle, getConfirmCelAccept } from './input.js';
import {
  sleep, waitUntil, openSession, dumpFailure, fatal, clearFolder, diagPath, DIAG_DIR,
} from './browser.js';
import { decodeSaml, getRoles } from './saml.js';
import type { SamlLoginResult } from './types.js';

interface GoogleMfa {
  code: boolean;
  promptCel: boolean;
  totp: boolean;
}

// Detecta o tipo de desafio de MFA do Google a partir da URL atual.
function detectGoogleMfa(currentUrl: string): GoogleMfa {
  const has = (fragment: string): boolean => currentUrl.includes(fragment);
  return {
    code: has('/signin/v2/challenge/ipp') || has('/signin/challenge/ipp'),
    promptCel: has('/signin/v2/challenge/dp') || has('/signin/challenge/dp'),
    totp: has('/signin/challenge/totp') || has('/signin/v2/challenge/totp'),
  };
}

export async function loginGoogleSSO(
  inputIdpid?: string,
  inputSpid?: string,
  monitor = false,
): Promise<SamlLoginResult> {
  const idpid = inputIdpid ?? process.env.GOOGLE_IDPID;
  const spid = inputSpid ?? process.env.GOOGLE_SPID;
  const timeoutPage = Number(process.env.TIMEOUT_PAGE ?? 2000);
  const authTimeout = Number(process.env.AUTH_TIMEOUT ?? 60000);

  if (!idpid || !spid) {
    fatal('idpid or spid not found');
  }

  clearFolder(DIAG_DIR);

  let samlResponse = '';
  const session = await openSession('google');
  const { page } = session;

  const shot = async (name: string): Promise<void> => {
    if (monitor) await page.screenshot({ path: diagPath(`${name}.png`) });
  };

  try {
    page.on('request', (request) => {
      if (request.url() === 'https://signin.aws.amazon.com/saml') {
        samlResponse = (request.postData() ?? '')
          .replace('SAMLResponse=', '')
          .replace('&RelayState=', '');
      }
    });

    await page.goto(
      `https://accounts.google.com/o/saml2/initsso?idpid=${idpid}&spid=${spid}&forceauthn=false`,
      { waitUntil: 'domcontentloaded' },
    );
    await shot('initial-page');

    // Fluxo adaptável: preenche email/senha apenas quando os campos aparecem.
    // Em dispositivo confiável (cookie de sessão persistido), o IdP pula direto
    // para o SAML e nada é solicitado.
    const deadline = Date.now() + authTimeout;
    let emailFilled = false;
    let passwordFilled = false;
    let mfa = detectGoogleMfa(page.url());

    while (Date.now() < deadline && !samlResponse) {
      mfa = detectGoogleMfa(page.url());
      if (mfa.code || mfa.promptCel || mfa.totp) break;

      const emailField = page.locator('#identifierId');
      if (!emailFilled && await emailField.count() > 0 && await emailField.isVisible().catch(() => false)) {
        await emailField.fill(await getEmail());
        await page.keyboard.press('Enter');
        emailFilled = true;
        await sleep(timeoutPage);
        continue;
      }

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
    await shot('pre-mfa');

    if (mfa.code) {
      const sendButton = page.locator('button[type="button"]');
      if (await sendButton.count() > 0) {
        await sendButton.first().click();
        await sleep(timeoutPage);
      }
      const code = await getMFAGoogle();
      await page.locator('input[type="tel"]').first().fill(code);
      await page.keyboard.press('Enter');
    }

    if (mfa.promptCel) {
      const status = await getConfirmCelAccept();
      if (!status) {
        await dumpFailure(page, 'google-mfa-not-confirmed');
        fatal('You did not confirm authentication');
      }
      const submit = page.locator('button[id="submit"]');
      if (await submit.count() > 0) {
        await submit.first().click();
      }
    }

    if (mfa.totp) {
      const code = await getMFAGoogle();
      await page.locator('input[type="tel"]').first().fill(code);
      await page.keyboard.press('Enter');
    }

    // Aguarda o POST do SAML para a AWS ser capturado (após login/MFA).
    await waitUntil(() => !!samlResponse, authTimeout);
    await shot('post-mfa');

    if (!samlResponse) {
      await dumpFailure(page, 'google-no-saml');
      fatal('SAMLResponse not found!');
    }
  } finally {
    await session.close();
  }

  const saml = decodeSaml(samlResponse);
  return { saml, roles: getRoles(saml) };
}
