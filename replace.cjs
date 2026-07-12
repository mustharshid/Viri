const fs = require('fs');
const file = '/Users/Mustho/Documents/Viri/pwa/src/pages/Cashier/CashierApp.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  [/Another terminal/g, 'Another cashier counter'],
  [/another terminal/g, 'another cashier counter'],
  [/the terminal/g, 'the cashier counter'],
  [/this terminal/g, 'this cashier counter'],
  [/Unregistered Terminal/g, 'Unregistered Cashier Counter'],
  [/Terminal Setup/g, 'Cashier Counter Setup'],
  [/Terminal Locked/g, 'Cashier Counter Locked'],
  [/Lock Terminal/g, 'Lock Cashier Counter'],
  [/Terminal Settings PIN/g, 'Cashier Counter Settings PIN'],
  [/terminal registration/g, 'cashier counter registration'],
  [/Terminal Status/g, 'Cashier Counter Status'],
  [/Terminal Lock PIN/g, 'Cashier Counter Lock PIN'],
  [/Single Terminal/g, 'Single Counter'],
  [/Multi-Terminal/g, 'Multi-Counter'],
  [/terminal view/g, 'cashier counter view'],
  [/Terminal Logs/g, 'Cashier Counter Logs'],
  [/Cashier Terminal/g, 'Cashier Counter'],
  [/Terminal PWA/g, 'Cashier Counter PWA'],
  [/Terminal Pairing/g, 'Cashier Counter Pairing'],
  [/link terminal/g, 'link cashier counter'],
  [/terminal license/g, 'cashier counter license'],
  [/active terminal/g, 'active cashier counter'],
  [/terminal \$\{/g, 'cashier counter \$\{'],
  [/terminal users/g, 'cashier counter users']
];

let replaced = content;
for (const [regex, replacement] of replacements) {
  replaced = replaced.replace(regex, replacement);
}

fs.writeFileSync(file, replaced);
console.log('Replacements done.');
