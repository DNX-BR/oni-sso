const puppeteer = require('puppeteer');
const { XMLParser } = require('fast-xml-parser');
const { GetMFAGoogle, GetConfirmCelAccept } = require('./input');

async function SAMLDecode(encodeSAML) {
  const uriDecoded = decodeURIComponent(encodeSAML);
  const b64decoded = new Buffer.from(uriDecoded, 'base64').toString('utf-8'); // eslint-disable-line  new-cap
  return b64decoded;
}

async function GetRoles(xml) {
  const roles = [];
  const parser = new XMLParser();
  const objectXML = parser.parse(xml);
  const rolesXml = objectXML['saml2p:Response']['saml2:Assertion']['saml2:AttributeStatement']['saml2:Attribute'][1];
  /* eslint-disable no-restricted-syntax */
  if (Array.isArray(rolesXml['saml2:AttributeValue'])) {
    for (const r of rolesXml['saml2:AttributeValue']) {
      roles.push({ role: r.split(',')[0], principal: r.split(',')[1] });
    }
  } else {
    roles.push({ role: rolesXml['saml2:AttributeValue'].split(',')[0], principal: rolesXml['saml2:AttributeValue'].split(',')[1] });
  }
  return roles;
  /* eslint-disable no-restricted-syntax */
}

async function LoginGoogleSSO(email, password, inputIdpid, inputSpid) {
  const idpid = inputIdpid || process.env.GOOGLE_IDPID;
  const spid = inputSpid || process.env.GOOGLE_SPID;

  /* eslint-disable no-console */
  if (!idpid || !spid) {
    console.error('idpid or spid not found');
    process.exit(1);
  }
  /* eslint-disable no-console */

  let SAMLResponse = '';
  const browser = await puppeteer.launch({
    headless: true,
    timeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  page.on('request', (request) => {
    if (request.url() === 'https://signin.aws.amazon.com/saml') {
      SAMLResponse = request.postData().replace('SAMLResponse=', '').replace('&RelayState=', '');
    }
  });

  await page.goto(`https://accounts.google.com/o/saml2/initsso?idpid=${idpid}&spid=${spid}&forceauthn=false`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  await page.waitForSelector('input[type="password"]');
  await page.type('input[type="password"]', password);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  await page.waitForTimeout(2000);

  const currentPage = page.url();

  /* Send Message code to Cel */
  const mfaCodeExists = currentPage.includes('/signin/v2/challenge/ipp') ? true : !!currentPage.includes('/signin/challenge/ipp');

  /* New Page MFA Prompt Cel */
  const mfaPromptCelExists = currentPage.includes('/signin/v2/challenge/dp') ? true : !!currentPage.includes('/signin/challenge/dp');

  /* Page Google Authenticate */
  const mfaGoogleAuth = currentPage.includes('/signin/challenge/totp') ? true : !!currentPage.includes('/signin/v2/challenge/totp');

  if (mfaCodeExists) {
    const buttonSendCode = await page.evaluate(() => {
      const el = document.querySelector('button[type="button"]'); /* eslint-disable-line no-undef */
      return !!el;
    });

    if (buttonSendCode) {
      await page.click('button[type="button"]');
      await page.waitForTimeout(1000);
    }

    const mfaCode = await GetMFAGoogle();
    await page.type('input[type="tel"]', mfaCode.mfa);
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
  }

  if (mfaPromptCelExists) {
    const status = await GetConfirmCelAccept();
    if (!status) {
      console.error('You did not confirm authentication'); // eslint-disablline no-console
      process.exit(1);
    } else {
      const checkConfirmButtonExists = await page.evaluate(() => {
        const el = document.querySelector('button[id="submit"]'); /* eslint-disable-line no-undef */
        return !!el;
      });
      if (checkConfirmButtonExists) {
        await page.click('button[id="submit"]');
        await page.waitForTimeout(3000);
      }
    }
  }

  if (mfaGoogleAuth) {
    const mfaCode = await GetMFAGoogle();
    await page.type('input[type="tel"]', mfaCode.mfa);
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
  }

  /* eslint-disable no-console */
  if (!SAMLResponse) {
    console.error('SAMLResponse not found!');
    process.exit(1);
  }
  /* eslint-disable no-console */

  browser.close();

  const saml = await SAMLDecode(SAMLResponse);
  const roleList = await GetRoles(saml);

  return {
    saml,
    roles: roleList,
  };
}

module.exports = {
  LoginGoogleSSO,
};
