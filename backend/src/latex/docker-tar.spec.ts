import { encodeTarFile, readTarFile } from './docker-tar';

describe('docker tar', () => {
  it('round-trips a file', () => {
    const content = Buffer.from(
      '\\documentclass{article}Hi\\end{document}',
      'utf8',
    );
    const archive = encodeTarFile('input.tex', content);
    expect(readTarFile(archive, 'input.tex')?.equals(content)).toBe(true);
  });

  it('round-trips content that is not block aligned', () => {
    // Real PDFs are never a multiple of 512 bytes.
    const content = Buffer.from('%PDF-1.7' + 'x'.repeat(4321), 'utf8');
    const archive = encodeTarFile('output.pdf', content);
    expect(archive.length % 512).toBe(0);
    expect(readTarFile(archive, 'output.pdf')?.equals(content)).toBe(true);
  });

  it('writes a valid ustar header', () => {
    const archive = encodeTarFile('input.tex', Buffer.from('abcd'));
    const header = archive.subarray(0, 512);
    expect(header.subarray(0, 9).toString()).toBe('input.tex');
    expect(header.subarray(257, 262).toString()).toBe('ustar');
    expect(header.subarray(156, 157).toString()).toBe('0');
    // Octal size field: 4 bytes as "00000000004".
    expect(header.subarray(124, 135).toString()).toBe('00000000004');
    // The checksum is the sum of the header with the field itself as spaces.
    const stored = parseInt(header.subarray(148, 154).toString(), 8);
    const zeroed = Buffer.from(header);
    zeroed.write('        ', 148, 8, 'utf8');
    const expected = zeroed.reduce((sum, byte) => sum + byte, 0);
    expect(stored).toBe(expected);
  });

  it('returns null for a missing entry and for an empty archive', () => {
    const archive = encodeTarFile('input.tex', Buffer.from('abcd'));
    expect(readTarFile(archive, 'output.pdf')).toBeNull();
    expect(readTarFile(Buffer.alloc(1024), 'input.tex')).toBeNull();
  });

  it('refuses names that do not fit a ustar header', () => {
    expect(() => encodeTarFile('a'.repeat(120), Buffer.from('x'))).toThrow(
      /too long/,
    );
  });
});
