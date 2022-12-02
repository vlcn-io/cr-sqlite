// @ts-ignore
import { access, FileHandle, open, rm } from "node:fs/promises";
import {
  SQLITE_OPEN_DELETEONCLOSE,
  SQLITE_IOERR_SHORT_READ,
  SQLITE_OPEN_CREATE,
  SQLITE_CANTOPEN,
  SQLITE_IOERR,
  SQLITE_OK,
  Base,
  // @ts-ignore
} from "@vlcn.io/wa-sqlite/src/VFS";
// @ts-ignore
import { resolve } from "node:path";

type File = { handle: FileHandle; flags: number; path: string };
type Result<T = number> = { set: (value: T) => void };
type Data = { size: number; value: Int8Array };

export class NodeVFS extends Base {
  files = new Map<number, File>();
  name = "node";

  xOpen(path: string | null, id: number, flags: number, outFlags: Result) {
    return this.handle(null, async () => {
      path =
        path ||
        Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
      path = resolve(path) as string;

      let mode = "r+";
      try {
        await access(path);
      } catch (error) {
        if (flags & SQLITE_OPEN_CREATE) mode = "w+";
        else throw error;
      }

      try {
        const handle = await open(path, mode);
        this.files.set(id, { handle, flags, path });
        outFlags.set(flags);
      } catch {
        return SQLITE_CANTOPEN;
      }
    });
  }

  xClose(id: number) {
    return this.handle(id, async ({ handle, flags, path }) => {
      this.files.delete(id);
      await handle.close();
      if (flags & SQLITE_OPEN_DELETEONCLOSE) await rm(path);
    });
  }

  xRead(id: number, data: Data, offset: number) {
    return this.handle(id, async ({ handle }) => {
      const size = (await handle.stat()).size;
      const start = Math.min(offset, size);
      const end = Math.min(offset + data.size, size);
      const length = end - start;

      if (length) {
        // @ts-ignore
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, start);
        data.value.set(buffer);
      }

      if (length < data.size) {
        data.value.fill(0, end);
        return SQLITE_IOERR_SHORT_READ;
      }
    });
  }

  xWrite(id: number, data: Data, offset: number) {
    return this.handle(id, async ({ handle }) => {
      await handle.write(new Uint8Array(data.value), 0, data.size, offset);
    });
  }

  xTruncate(id: number, size: number) {
    return this.handle(id, async ({ handle }) => {
      await handle.truncate(size);
    });
  }

  xFileSize(id: number, outSize: Result) {
    return this.handle(id, async ({ handle }) => {
      outSize.set((await handle.stat()).size);
    });
  }

  xDelete(path: string) {
    return this.handle(null, async () => {
      await rm(path);
    });
  }

  xAccess(path: string, flags: number, accessOut: Result) {
    return this.handle(null, async () => {
      try {
        await access(path, flags);
        accessOut.set(1);
      } catch {
        accessOut.set(0);
      }
    });
  }

  handle<T extends number | null>(
    id: T,
    fn: (file: T extends number ? File : undefined) => Promise<void | number>
  ) {
    return (this as any).handleAsync(() => {
      const file = id ? this.files.get(id) : undefined;
      if (id && !file) return Promise.resolve(SQLITE_IOERR);
      return fn(file as any)
        .then((code) => code || SQLITE_OK)
        .catch(() => SQLITE_IOERR);
    });
  }
}
