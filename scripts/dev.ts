import { spawn } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const s3Endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";

console.log('🚀 [DevServer] Starting Next.js Web and Worker services...');
console.log(`🔗 [DevServer] Using S3 Endpoint: ${s3Endpoint}`);

const env = {
  ...process.env,
  S3_ENDPOINT: s3Endpoint,
};

const child = spawn('pnpm', ['run', 'dev:raw'], {
  env,
  stdio: 'inherit',
  shell: true
});

child.on('close', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
  process.exit(0);
});