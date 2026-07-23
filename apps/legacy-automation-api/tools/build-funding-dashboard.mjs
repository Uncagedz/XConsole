import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dataPath = process.argv[2] ?? path.join(rootDir, 'tmp', 'funding_dashboard_data.json');
const templatePath = process.argv[3] ?? path.join(rootDir, 'tools', 'funding-dashboard.template.html');
const outputPath = process.argv[4] ?? 'c:\\Users\\workw\\Downloads\\NOT FINALIZED DEALS Dashboard.html';

const rawData = fs.readFileSync(dataPath, 'utf8').replace(/^\uFEFF/, '');
const payload = JSON.parse(rawData);
const template = fs.readFileSync(templatePath, 'utf8');
const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
const html = template.replace('__DASHBOARD_PAYLOAD__', serialized);

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Built dashboard: ${outputPath}`);
