/**
 * Minimal ustar reader/writer for the two files a compile job exchanges with the
 * sandbox container (input.tex in, output.pdf out) over the Docker archive API
 * (`docker cp` without the CLI).
 *
 * Only plain regular-file entries are handled; PAX/GNU extended headers are
 * skipped. Filenames are fixed by this codebase, so the 100-byte name limit and
 * no-prefix layout are never a constraint.
 */

const BLOCK = 512;

function writeString(
  header: Buffer,
  value: string,
  offset: number,
  length: number,
) {
  header.write(value, offset, length, 'utf8');
}

function writeOctal(
  header: Buffer,
  value: number,
  offset: number,
  length: number,
) {
  header.write(
    value
      .toString(8)
      .padStart(length - 1, '0')
      .slice(-(length - 1)) + '\0',
    offset,
    length,
    'utf8',
  );
}

function readOctal(field: Buffer): number {
  const text = field.toString('utf8').replace(/\0.*$/, '').trim();
  const value = parseInt(text, 8);
  return Number.isFinite(value) ? value : 0;
}

function readString(field: Buffer): string {
  return field.toString('utf8').replace(/\0.*$/, '');
}

/** Builds a single-file tar archive: one ustar header, padded content, EOF. */
export function encodeTarFile(name: string, content: Buffer): Buffer {
  if (name.length > 99) throw new Error('Tar name too long');
  const header = Buffer.alloc(BLOCK);
  writeString(header, name, 0, 100);
  writeString(header, '0000644\0', 100, 8); // rw-r--r--
  writeString(header, '0000000\0', 108, 8); // uid
  writeString(header, '0000000\0', 116, 8); // gid
  writeOctal(header, content.length, 124, 12); // size
  writeOctal(header, 0, 136, 12); // mtime
  header.write('        ', 148, 8, 'utf8'); // checksum placeholder
  header.write('0', 156, 1, 'utf8'); // regular file
  writeString(header, 'ustar\0', 257, 6);
  writeString(header, '00', 263, 2);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeOctal(header, checksum, 148, 8);
  // writeOctal pads with NUL; the checksum field wants "NNNNNN\0 ".
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8');

  const padding = (BLOCK - (content.length % BLOCK)) % BLOCK;
  return Buffer.concat([
    header,
    content,
    Buffer.alloc(padding),
    Buffer.alloc(BLOCK * 2), // end-of-archive marker
  ]);
}

/** Returns the contents of `name` from a tar archive, or null when absent. */
export function readTarFile(archive: Buffer, name: string): Buffer | null {
  let offset = 0;
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) return null; // end-of-archive

    const entryName = readString(header.subarray(0, 100));
    const size = readOctal(header.subarray(124, 136));
    const type = header.subarray(156, 157).toString('utf8');
    const dataStart = offset + BLOCK;

    // '0'/'\0' are regular files; 'x'/'g' are PAX metadata, never the payload.
    if ((type === '0' || type === '\0') && entryName === name) {
      return archive.subarray(dataStart, dataStart + size);
    }
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  return null;
}
