$ErrorActionPreference = "Stop"

$python = "C:\Users\82103\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$flash = "C:\Users\82103\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\Scripts\flash.exe"

& $python -c "import runpod_flash; print('runpod_flash ok')"
& $flash --version

if ($env:RUNPOD_API_KEY) {
  "RUNPOD_API_KEY=set in current shell"
} elseif (Test-Path .env) {
  "RUNPOD_API_KEY may be in .env; apps/api/server.py now loads it automatically"
} else {
  "RUNPOD_API_KEY not found in current shell and .env does not exist"
}
