// Pure rules the controller uses for host tools: where.exe output, what a
// taskkill exit code means, how a yt-dlp failure is told apart from a timeout,
// and how many minutes a child ran. Nothing here touches the engine.

// where.exe with the $PATH: prefix prints only PATH matches, so a file in the
// current directory is never taken. The first line must be an absolute .exe.
export function parseWhereOutput(stdout: string): string | null {
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    return /^[A-Za-z]:[\\/].*\.exe$/i.test(line) ? line : null
  }
  return null
}

// taskkill exits 0 when it ended something and 128 when nothing was running:
// both mean the machine has no ffplay.exe left from this mod.
export function killSucceeded(exitCode: number): boolean {
  return exitCode === 0 || exitCode === 128
}

// $.process.run rejects when the command cannot start or is still running at
// its timeout. A rejection well inside the timeout means it could not start.
export function isStartFailure(elapsedMs: number, timeoutMs: number): boolean {
  return elapsedMs < timeoutMs - 1000
}

// Minutes a child ran, from its start clock to now. A start of 0 means the
// clock was unavailable when it began, so nothing is counted.
export function minutesBetween(startedAt: number, now: number): number {
  if (!(startedAt > 0) || !(now > startedAt)) return 0
  return (now - startedAt) / 60000
}
