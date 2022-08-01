const inquirer = require('inquirer');

async function SelectRole(roles) {
  const roleSelect = await inquirer
    .prompt([
      {
        type: 'list',
        message: 'What is your role?',
        name: 'role',
        choices: roles.map((r) => r.role),
      },
    ]);

  return roleSelect;
}

async function SelectAccount(accounts) {
  const accountSelect = await inquirer
    .prompt([
      {
        type: 'list',
        message: 'Choose an account:',
        name: 'account',
        choices: accounts.map((a) => a.account.split('#')[0]),
      },
    ]);

  return accountSelect;
}

async function GetUsernamePassword() {

  if (process.env.ONI_USERNAME && process.env.ONI_PASSWORD) {
    return {
      email: process.env.ONI_USERNAME,
      password: process.env.ONI_PASSWORD
    }
  } {
    const loginInput = await inquirer
      .prompt([
        {
          type: 'input',
          name: 'email',
          message: 'Enter a email:',
        },
        {
          type: 'password',
          message: 'Enter a password:',
          name: 'password',
        },
      ]);
    return loginInput;
  }

}

async function GetMFAGoogle() {
  const code = await inquirer
    .prompt([
      {
        type: 'input',
        name: 'mfa',
        message: 'Input MFA Code:',
      },
    ]);
  return code;
}

async function GetConfirmCelAccept() {
  console.log('Did you confirm authentication on your smartphone?'); // eslint-disable-line no-console
  const status = await inquirer
    .prompt([
      {
        type: 'confirm',
        name: 'Confirm',
      },
    ]);
  return status.Confirm;
}

module.exports = {
  GetUsernamePassword, SelectRole, GetMFAGoogle, SelectAccount, GetConfirmCelAccept,
};
