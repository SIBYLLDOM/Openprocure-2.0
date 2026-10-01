const fs = require('fs');
const path = require('path');

const logoPath = path.join(__dirname, '../Frontend/src/assets/img/logo.png');
if (fs.existsSync(logoPath)) {
  const base64Logo = fs.readFileSync(logoPath, { encoding: 'base64' });
  const dataUri = `data:image/png;base64,${base64Logo}`;
  fs.writeFileSync(path.join(__dirname, 'base64_logo.txt'), dataUri);
  console.log('Successfully saved base64 logo URI to base64_logo.txt');
} else {
  console.error('Logo not found at:', logoPath);
}
