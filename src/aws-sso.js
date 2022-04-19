const puppeteer = require('puppeteer');
const { GetAccountsFromPage } = require('./util');
const { SelectAccount } = require('./input');
const { TempCredentialsOutput } = require('./output');

async function LoginAWSSO(username, password, url) {
  const browser = await puppeteer.launch({
    headless: true,
    timeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForTimeout(6000);

  await page.waitForSelector('input[type="text"]');
  await page.type('input[type="text"]', username);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);

  await page.waitForSelector('input[id="awsui-input-1"]');
  await page.type('input[id="awsui-input-1"]', password);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  await page.waitForSelector('portal-application[title="AWS Account"]');
  await page.click('portal-application[title="AWS Account"]');
  await page.waitForTimeout(1000);

  const innerHtml = await page.evaluate(() => document.querySelector('portal-instance-list').innerHTML); /* eslint-disable-line no-undef */
  const accounts = await GetAccountsFromPage(innerHtml);
  const selectedAccount = await SelectAccount(accounts);

  const idAccountBox = accounts.filter((r) => { /* eslint-disable-line array-callback-return, consistent-return, max-len */
    if (r.account.split('#')[0] === selectedAccount.account) return 1;
  })[0].id;

  await page.click(`#${idAccountBox} > div > div > div > div.name`);
  await page.waitForTimeout(1000);
  await page.waitForSelector('#temp-credentials-button');
  await page.click('#temp-credentials-button');
  await page.waitForTimeout(2000);

  const Credentials = {};
  Credentials.AccessKeyId = await (await page.evaluate(() => document.querySelector('#env-var-linux > div:nth-child(1)').textContent)) /* eslint-disable-line no-undef */
    .replace(/\n/g, '').replace(/\s/g, '').replace('export', '').replace('AWS_ACCESS_KEY_ID=', '')
    .replace(/"/g, '');

  Credentials.SecretAccessKey = await (await page.evaluate(() => document.querySelector('#env-var-linux > div:nth-child(2)').textContent)) /* eslint-disable-line no-undef */
    .replace(/\n/g, '').replace(/\s/g, '').replace('export', '').replace('AWS_SECRET_ACCESS_KEY=', '')
    .replace(/"/g, '');

  Credentials.SessionToken = await (await page.evaluate(() => document.querySelector('#env-var-linux > div:nth-child(3)').textContent)) /* eslint-disable-line no-undef */
    .replace(/\n/g, '').replace(/\s/g, '').replace('export', '').replace('AWS_SESSION_TOKEN=', '')
    .replace(/"/g, '');

  browser.close();

  await TempCredentialsOutput(Credentials);

  return Credentials;
}

module.exports = {
  LoginAWSSO,
};
