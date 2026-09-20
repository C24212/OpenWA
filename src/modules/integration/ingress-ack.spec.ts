import { ackContentType, renderAck, safeAckHeaders } from './ingress-ack';

const ctx = { rawBody: '{"a":1}', timestamp: '1700000000', id: 'd1' };

describe('renderAck', () => {
  it('returns the default 202 ack when no spec is declared', () => {
    expect(renderAck(undefined, ctx)).toEqual({ status: 202, body: 'accepted' });
  });

  it('renders a declared status and body verbatim', () => {
    expect(renderAck({ status: 200, body: '{"ok":true}' }, ctx)).toEqual({ status: 200, body: '{"ok":true}' });
  });

  it('substitutes {rawBody}/{timestamp}/{id} templates', () => {
    expect(renderAck({ body: 'echo:{rawBody}:{id}:{timestamp}' }, ctx).body).toBe('echo:{"a":1}:d1:1700000000');
  });

  it('passes through declared headers', () => {
    expect(renderAck({ headers: { 'content-type': 'application/json' } }, ctx).headers).toEqual({
      'content-type': 'application/json',
    });
  });

  it('substitutes literally even when rawBody contains $ characters (no regex/$ semantics)', () => {
    expect(renderAck({ body: '{rawBody}' }, { ...ctx, rawBody: '$&$`$1' }).body).toBe('$&$`$1');
  });

  it('omits body and headers when not declared', () => {
    expect(renderAck({ status: 204 }, ctx)).toEqual({ status: 204 });
  });
});

describe('ackContentType', () => {
  it('falls back to text/plain when no headers or no content-type are declared', () => {
    expect(ackContentType(undefined)).toBe('text/plain');
    expect(ackContentType({})).toBe('text/plain');
    expect(ackContentType({ 'x-ack': '1' })).toBe('text/plain');
  });

  it('honors an allowlisted type, keeping the declared value verbatim', () => {
    expect(ackContentType({ 'content-type': 'application/json' })).toBe('application/json');
    expect(ackContentType({ 'content-type': 'application/json; charset=utf-8' })).toBe(
      'application/json; charset=utf-8',
    );
  });

  it('matches the header name and the media type case-insensitively', () => {
    expect(ackContentType({ 'Content-Type': 'Application/JSON' })).toBe('Application/JSON');
  });

  it('forces text/plain for anything a browser could execute', () => {
    expect(ackContentType({ 'content-type': 'text/html' })).toBe('text/plain');
    expect(ackContentType({ 'content-type': 'image/svg+xml' })).toBe('text/plain');
    expect(ackContentType({ 'content-type': 'application/xhtml+xml' })).toBe('text/plain');
    // A prefix that merely starts with an allowlisted type must not slip through.
    expect(ackContentType({ 'content-type': 'application/json-but-html' })).toBe('text/plain');
    expect(ackContentType({ 'content-type': '' })).toBe('text/plain');
  });
});

describe('safeAckHeaders (a plugin-authored ack cannot undo the app response contract)', () => {
  it('drops the headers that decide how a browser treats the reflected body', () => {
    expect(
      safeAckHeaders({
        'X-Content-Type-Options': 'nosniff-not',
        'Content-Security-Policy': 'default-src *',
        'Set-Cookie': 'a=b',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/html',
        'X-Provider-Ack': 'ok',
      }),
    ).toEqual({ 'X-Provider-Ack': 'ok' });
  });

  it('is total: no headers, and a non-string value, both answer an object', () => {
    expect(safeAckHeaders(undefined)).toEqual({});
    expect(safeAckHeaders({ 'X-N': 7 as unknown as string })).toEqual({});
  });
});

describe('renderAck / ackContentType stay total on a manifest the loader did not type-check', () => {
  const ctx = { rawBody: '{}', timestamp: '1', id: 'd1' };

  it('ignores a non-string body and a non-number status instead of throwing', () => {
    const spec = { status: '202' as unknown as number, body: 7 as unknown as string };
    expect(renderAck(spec, ctx)).toEqual({ status: 202 });
  });

  it('ignores a non-string declared content type', () => {
    expect(ackContentType({ 'content-type': 7 as unknown as string })).toBe('text/plain');
  });
});
