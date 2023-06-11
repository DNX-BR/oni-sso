const puppeteer = require('puppeteer');
const util = require('util');
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { GetConfirmCelAccept } = require('./input');


const deflate = util.promisify(zlib.deflateRaw);

const SAMLDecode = async (encodeSAML) => {
  const uriDecoded = decodeURIComponent(encodeSAML);
  const b64decoded = Buffer.from(uriDecoded, 'base64').toString('utf-8');
  return b64decoded;
};

const GetRoles = async (xml) => {
  const roles = [];
  const parser = new XMLParser();
  const objectXML = parser.parse(xml);

  const rolesXml = objectXML['samlp:Response'].Assertion.AttributeStatement.Attribute;
  for (const r of rolesXml) {
    if (r.AttributeValue.toString().includes('arn:aws:iam:')) {
      roles.push({ role: r.AttributeValue.toString().split(',')[0], principal: r.AttributeValue.toString().split(',')[1] });
    }
  }
  return roles;
};

const GetScreenshot = async (page, outputPath) => {
  await page.screenshot({ path: outputPath });
};

const LoginAzureSSO = async (email, password, inputAppIdUri, inputTenantId, monitor) => {
  const appIdUri = inputAppIdUri || process.env.AZURE_APP_ID_URI;
  const tenantId = inputTenantId || process.env.TENANT_ID;
  const timeoutPage = process.env.TIMEOUT_PAGE || 5000;
  const captureScreenshot = monitor || false;
  const folderPath = '/tmp';

  if (!appIdUri || !tenantId) {
    console.error('appIdUri or tenantId not found');
    process.exit(1);
  }

  const clearFolder = (folderPath) => {
    fs.readdirSync(folderPath).forEach((file) => {
      const filePath = path.join(folderPath, file);
      try {
        fs.unlinkSync(filePath);
      } catch (error) {}
    });
  };
  
  clearFolder(folderPath);

  const id = uuidv4();

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

  if (captureScreenshot) {
    await GetScreenshot(page, '/tmp/initial-page.png');
  }

  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(timeoutPage);

  if (captureScreenshot) {
    await GetScreenshot(page, '/tmp/post-enter-email.png');
  }

  await page.waitForSelector('input[type="password"]');
  await page.type('input[type="password"]', password);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await page.waitForTimeout(timeoutPage);

  if (captureScreenshot) {
    await GetScreenshot(page, '/tmp/mfa.png');
  }

  const mfaExists = await page.evaluate(() => {
    const el = document.querySelector('#idDiv_SAOTCAS_Title');
    return !!el;
  });

  if (captureScreenshot) {
    await GetScreenshot(page, '/tmp/post-mfa.png');
  }

  if (mfaExists) {
    const numberMfa = await page.evaluate(() => {
      const el = document.querySelector('#idRichContext_DisplaySign'); // Seleciona o elemento pelo ID
      return el.textContent.trim(); // Obtém o texto e remove espaços em branco extras
    });
    
    console.log('\x1b[1mPut the value in app:\x1b[1m ' + numberMfa);

    const status = await GetConfirmCelAccept();
    if (!status) {
      console.error('You did not confirm authentication');
      process.exit(1);
    } else {
      const checkConfirmButtonExists = await page.evaluate(() => {
        const el = document.querySelector('input[type="button"][id="idBtn_Back"]');
        return !!el;
      });

      if (captureScreenshot) {
        await GetScreenshot(page, '/tmp/pre-stay-signed.png');
      }

      if (checkConfirmButtonExists) {
        const selector = 'div.win-scroll input[type="submit"]';
        const elementHandle = await page.$(selector);
        await elementHandle.click();
        await page.waitForTimeout(timeoutPage);

        if (captureScreenshot) {
          await GetScreenshot(page, '/tmp/post-stay-signed.png');
        }
      }
    }
  }

  if (!SAMLResponse) {
    console.error('SAMLResponse not found!');
    process.exit(1);
  }

  await browser.close();

  const saml = await SAMLDecode(SAMLResponse);
  const roleList = await GetRoles(saml);

  return {
    saml,
    roles: roleList,
  };
};

module.exports = {
  LoginAzureSSO,
};
