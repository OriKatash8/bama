// eslint-disable-next-line @typescript-eslint/no-require-imports
const { transformSync } = require('@babel/core');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../removeConsole');

const run = (code: string): string =>
  transformSync(code, { babelrc: false, configFile: false, plugins: [plugin] }).code;

describe('removeConsole babel plugin', () => {
  it('removes console.log / info / debug statements', () => {
    const out = run("console.log('a'); console.info('b'); console.debug('c'); keep();");
    expect(out).not.toMatch(/console/);
    expect(out).toContain('keep()');
  });

  it('keeps console.warn and console.error', () => {
    const out = run("console.warn('w'); console.error('e');");
    expect(out).toContain('console.warn');
    expect(out).toContain('console.error');
  });

  it('keeps expressions valid when the call is not a statement', () => {
    const out = run("const f = () => console.log('x'); ok && console.log('y');");
    expect(out).not.toMatch(/console/);
    expect(out).toContain('void 0');
  });

  it('drops the arguments with the call', () => {
    const out = run('console.log(snap.docs.map((d) => d.id));');
    expect(out).not.toContain('snap.docs');
  });

  it('leaves other objects with a log method alone', () => {
    const out = run("logger.log('x'); other.console.log('y');");
    expect(out).toContain("logger.log('x')");
    expect(out).toContain('other.console.log');
  });
});
