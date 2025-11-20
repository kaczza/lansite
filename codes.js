const fs = require('fs');
const path = require('path');
const codesFile = path.join(__dirname, 'codes.json');

let codes = {};
if (fs.existsSync(codesFile)) {
  try {
    codes = JSON.parse(fs.readFileSync(codesFile, 'utf8'));
   console.log('\x1b[36m%s\x1b[0m', `[Info] Loaded ${Object.keys(codes).length} codes from codes.json.`);
  } catch (err) {
   console.error('\x1b[31m%s\x1b[0m', '[Error] Failed to read or parse codes.json:', err);

    codes = {};
  }
} else {
 console.log('\x1b[36m%s\x1b[0m', '[Info] codes.json not found. A new file will be created upon saving.');

}

function saveCodes() {
  try {
    fs.writeFileSync(codesFile, JSON.stringify(codes, null, 2), 'utf8');
    console.log('\x1b[32m%s\x1b[0m', '[Info] Codes saved successfully!');
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', '[Error] Error while saving codes:', err);
  }
}


function getUsernameByCode(code) {
  if (!code) return null;
  const norm = String(code).trim().toUpperCase();
  return codes.hasOwnProperty(norm) ? codes[norm] : null;
}

function addCode(code, username) {
  if (!code || !username) return false;
  const norm = String(code).trim().toUpperCase();
  codes[norm] = username;
  saveCodes();
  return true;
}

module.exports = {
  getUsernameByCode,
  addCode,
  codes,
  saveCodes
};