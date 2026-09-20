import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateSessionProxyDto } from './session-proxy.dto';

describe('UpdateSessionProxyDto proxy credential escapes', () => {
  const errorsFor = async (proxyUrl: string): Promise<string[]> => {
    const dto = plainToInstance(UpdateSessionProxyDto, { proxyUrl });
    const errors = await validate(dto);
    return errors.flatMap(e => Object.values(e.constraints ?? {}));
  };

  it('rejects credentials carrying a percent that begins no escape', async () => {
    expect(await errorsFor('http://u:pa%ss@proxy.local:8080')).toEqual([
      expect.stringContaining('invalid percent-escape'),
    ]);
  });

  it('accepts a properly escaped percent and an ordinary credentialed URL', async () => {
    expect(await errorsFor('http://u:pa%25ss@proxy.local:8080')).toEqual([]);
    expect(await errorsFor('socks5://user:p%40ss@proxy.local:1080')).toEqual([]);
    expect(await errorsFor('http://proxy.local:8080')).toEqual([]);
  });
});
