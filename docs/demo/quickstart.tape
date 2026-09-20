# NOTE: vhs 0.12.0 exits 0 and writes no file (charmbracelet/vhs#787); use 0.11.0.
# Render with: vhs docs/demo/quickstart.tape
# Run from the repository root after `pnpm install && pnpm build`.
Output docs/demo/quickstart.gif

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 520
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Type "node packages/cli/dist/cli.js --help"
Sleep 300ms
Enter
Sleep 2s

Type "node packages/cli/dist/cli.js export packages/core/test/fixtures/order-intake.json -o my-workflow.png --scale 3"
Sleep 300ms
Enter
Sleep 2s

Type "node packages/cli/dist/cli.js export packages/core/test/fixtures/execution-loop.json -o loop.svg"
Sleep 300ms
Enter
Sleep 2s

Type "ls -la my-workflow.png loop.svg"
Sleep 300ms
Enter
Sleep 2.5s
