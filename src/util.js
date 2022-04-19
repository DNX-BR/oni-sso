const { parse } = require('node-html-parser');

async function GetAccountsFromPage(html) {
  const accounts = [];
  /* eslint-disable no-restricted-syntax */
  const parseHtml = await parse(html);
  for (const element of parseHtml.childNodes) {
    for (const ele of element.childNodes) {
      const textAccount = ele.textContent.replace(/\s/g, '');
      if (textAccount) {
        for (const elementId of ele.childNodes[0].parentNode.parentNode.childNodes) {
          if (elementId.id) {
            accounts.push({ account: textAccount, id: elementId.id });
          }
        }
      }
    }
  }
  /* eslint-disable no-restricted-syntax */
  return accounts;
}

module.exports = {
  GetAccountsFromPage,
};
