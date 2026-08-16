$ErrorActionPreference = "Stop"

$python = "C:\Users\82103\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $repoRoot
$env:RUNPOD_USE_FLASH = "1"
$env:PORT = "8790"

& $python apps\api\server.py
