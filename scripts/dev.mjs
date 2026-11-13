import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const commands = [
  ['--env-file-if-exists=.env.local', 'server/index.mjs'],
  ['node_modules/vite/bin/vite.js'],
];
const children = commands.map(args => spawn(process.execPath, args, { cwd, stdio: 'inherit' }));
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  const deadline = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  }, 5000);
  deadline.unref();
}
for (const child of children) {
  child.on('error', () => { console.error('Could not start the local app. Run npm install and check Node.js.'); stop(1); });
  child.on('exit', code => stop(code ?? 1));
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
