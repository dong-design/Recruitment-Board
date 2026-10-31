// Run once in the dashboard deployment to create a private owner password.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const target = path.resolve(process.argv[2] || path.join(__dirname, '../dashboard'), '.board-auth.json');
if (fs.existsSync(target)) {
  console.log('Owner credentials already exist at ' + target);
} else {
  fs.writeFileSync(target, JSON.stringify({ username: 'owner', password: crypto.randomBytes(24).toString('base64url') }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log('Owner credentials saved at ' + target + ' (password not printed)');
}
