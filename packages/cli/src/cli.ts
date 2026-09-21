#!/usr/bin/env node
import { exportFile, packageVersion, parseArgs, USAGE, USAGE_EXIT_CODE } from './index.js';
import { serve } from './view.js';

const command = parseArgs(process.argv.slice(2));

if (command.kind === 'help') {
  process.stdout.write(`${USAGE}\n`);
} else if (command.kind === 'version') {
  process.stdout.write(`${packageVersion()}\n`);
} else if (command.kind === 'error') {
  process.stderr.write(`workflow-render: ${command.message}\n\n${USAGE}\n`);
  // Every parse error is a usage error: nothing was read or written.
  process.exitCode = command.exitCode ?? USAGE_EXIT_CODE;
} else if (command.kind === 'export') {
  try {
    const { warnings } = await exportFile(command);
    process.stdout.write(`wrote ${command.out}\n`);
    // What the adapter dropped while reading the file. The export is still
    // written -- a dangling connection is not a reason to refuse -- but it
    // must not pass silently either.
    for (const warning of warnings) process.stderr.write(`warning: ${warning}\n`);
  } catch (error) {
    process.stderr.write(`workflow-render: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
} else {
  try {
    const server = await serve(command.file, command.port);
    process.stdout.write(`workflow-render viewing ${command.file}\n  ${server.url}\nPress Ctrl+C to stop.\n`);
  } catch (error) {
    process.stderr.write(`workflow-render: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
