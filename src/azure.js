const puppeteer = require('puppeteer');
const util = require('util');
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');

const deflate = util.promisify(zlib.deflateRaw);
const { v4 } = require('uuid');
const { GetMFAGoogle } = require('./input');

async function SAMLDecode(encodeSAML) {
  const uriDecoded = decodeURIComponent(encodeSAML);
  const b64decoded = new Buffer.from(uriDecoded, 'base64').toString('utf-8'); // eslint-disable-line  new-cap
  return b64decoded;
}

async function GetRoles(xml) {
  const roles = [];
  const parser = new XMLParser();
  const objectXML = parser.parse(xml);

  const rolesXml = objectXML['samlp:Response'].Assertion.AttributeStatement.Attribute;
  for (const r of rolesXml) { // eslint-disable-line  no-restricted-syntax
    if (r.AttributeValue.toString().includes('arn:aws:iam:')) roles.push({ role: r.AttributeValue.toString().split(',')[0], principal: r.AttributeValue.toString().split(',')[1] });
  }
  return roles;
}

async function LoginAzureSSO(email, password, inputAppIdUri, inputTenantId) {
  const appIdUri = inputAppIdUri || process.env.AZURE_APP_ID_URI;
  const tenantId = inputTenantId || process.env.TENANT_ID;

  if (!appIdUri || !tenantId) {
    console.error('appIdUri or tenantId not found'); // eslint-disable-line  no-console
    process.exit(1);
  }

  const id = v4();

  const samlRequest = `
        <samlp:AuthnRequest xmlns="urn:oasis:names:tc:SAML:2.0:metadata" ID="id${id}" Version="2.0" IssueInstant="${new Date().toISOString()}" IsPassive="false" AssertionConsumerServiceURL="https://signin.aws.amazon.com/saml" xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
            <Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">${appIdUri}</Issuer>
            <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"></samlp:NameIDPolicy>
        </samlp:AuthnRequest>
        `;
  const deflateSaml = await deflate(samlRequest);
  const samlBase64 = deflateSaml.toString('base64');
  const url = `https://login.microsoftonline.com/${tenantId}/saml2?SAMLRequest=${encodeURIComponent(samlBase64)}`;
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

  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');

  await page.type('input[type="email"]', email);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);

  await page.waitForSelector('input[type="password"]');
  await page.type('input[type="password"]', password);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  const mfaExists = await page.evaluate(() => {
    const el = document.querySelector('#idDiv_SAOTCS_Proofs_Section'); // eslint-disable-line  no-undef
    return !!el;
  });

  if (mfaExists) {
    await page.click('div[data-value="OneWaySMS"]');
    const mfaCode = await GetMFAGoogle();
    await page.type('input[name="otc"]', mfaCode.mfa);
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    await page.click('input[id="idBtn_Back"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
  }

  const pageCotinueLoginExists = await page.evaluate(() => {
    const el = document.querySelector('input[id="idBtn_Back"]'); // eslint-disable-line  no-undef
    return !!el;
  });

  if (pageCotinueLoginExists) {
    await page.click('input[id="idBtn_Back"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
  }

  if (!SAMLResponse) {
    console.error('SAMLResponse not found!'); // eslint-disable-line  no-console
    process.exit(1);
  }

  browser.close();

  const saml = await SAMLDecode(SAMLResponse);
  const roleList = await GetRoles(saml);

  return {
    saml,
    roles: roleList,
  };
}

module.exports = {
  LoginAzureSSO,
};
