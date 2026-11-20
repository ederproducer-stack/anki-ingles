const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

require('../backup.js');
const Backup = globalThis.Backup;

test('makeZip gera um ZIP válido e íntegro', async () => {
  const enc = new TextEncoder();
  const blob = Backup.makeZip([
    { name: 'teste.txt', data: enc.encode('Olá mundo\n') },
    { name: 'audio/exemplo.mp3', data: new Uint8Array([1, 2, 3, 4, 5]) }
  ]);
  assert.equal(blob.type, 'application/zip');
  assert.ok(blob.size > 0);

  const file = path.join(os.tmpdir(), 'anki-zip-test.zip');
  const buffer = await blob.arrayBuffer();
  fs.writeFileSync(file, Buffer.from(buffer));
  try {
    const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    assert.match(out, /No errors detected/);
    const list = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
    assert.match(list, /teste\.txt/);
    assert.match(list, /audio\/exemplo\.mp3/);
  } finally {
    fs.unlinkSync(file);
  }
});
