import { readFile, writeFile, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';

export type LockHolder = {
  readonly pid: number;
  readonly hostname: string;
  readonly startedAt: number;
  readonly session: 'new' | 'open';
  readonly version: string;
};

export type AcquireOptions = {
  readonly session: 'new' | 'open';
  readonly version?: string;
};

export type AcquireResult =
  | {
      readonly acquired: true;
      readonly mode: 'writer';
      readonly staleEvicted?: boolean;
    }
  | {
      readonly acquired: false;
      readonly mode: 'viewer';
      readonly holder: LockHolder;
    };

export type LockStore = {
  readonly acquire: (options: AcquireOptions) => Promise<AcquireResult>;
  readonly read: () => Promise<LockHolder | null>;
  readonly release: () => Promise<void>;
};

function isLiveLocalPid(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ESRCH') return false;
    return true;
  }
}

export function createLockStore(path: string): LockStore {
  const selfHost = hostname();
  const selfPid = process.pid;

  async function readHolder(): Promise<LockHolder | null> {
    try {
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as LockHolder;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async function writeHolder(session: 'new' | 'open', version: string): Promise<void> {
    const holder: LockHolder = {
      pid: selfPid,
      hostname: selfHost,
      startedAt: Date.now(),
      session,
      version,
    };
    await writeFile(path, JSON.stringify(holder, null, 2), 'utf8');
  }

  return {
    async acquire({ session, version = '0.0.1' }) {
      const existing = await readHolder();

      if (!existing) {
        await writeHolder(session, version);
        return { acquired: true, mode: 'writer' };
      }

      const sameHost = existing.hostname === selfHost;
      if (sameHost && !isLiveLocalPid(existing.pid)) {
        try {
          await unlink(path);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
        await writeHolder(session, version);
        return { acquired: true, mode: 'writer', staleEvicted: true };
      }

      return { acquired: false, mode: 'viewer', holder: existing };
    },

    async read() {
      return readHolder();
    },

    async release() {
      const existing = await readHolder();
      if (!existing) return;
      if (existing.hostname !== selfHost || existing.pid !== selfPid) return;
      try {
        await unlink(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
    },
  };
}
