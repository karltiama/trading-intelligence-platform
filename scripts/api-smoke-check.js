const { spawnSync } = require('node:child_process');

const steps = [
  ['db:migrate', 'npm', ['run', 'db:migrate']],
  ['db:generate', 'npm', ['run', 'db:generate']],
  ['build:api', 'npm', ['run', 'build:api']],
  ['test:api', 'npm', ['run', 'test:api']],
  ['test:e2e:api', 'npm', ['run', 'test:e2e:api']],
];

function runStep(label, command, args) {
  process.stdout.write(`\n[smoke] Starting ${label}...\n`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    process.stderr.write(`\n[smoke] Failed at ${label}.\n`);
    process.exit(result.status ?? 1);
  }

  process.stdout.write(`[smoke] Completed ${label}.\n`);
}

for (const [label, command, args] of steps) {
  runStep(label, command, args);
}

process.stdout.write('\n[smoke] API smoke check passed.\n');
