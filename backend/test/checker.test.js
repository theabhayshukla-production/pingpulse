const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTargetUrl,
  resolvePublicAddresses,
  TargetValidationError,
  validateTargetUrl
} = require('../services/checker');

test('normalizes valid HTTP and HTTPS URLs', () => {
  assert.equal(parseTargetUrl('example.com/health').href, 'https://example.com/health');
  assert.equal(parseTargetUrl('http://example.com/health').protocol, 'http:');
});

test('rejects unsupported protocols and embedded credentials', () => {
  for (const url of ['ftp://example.com', 'file:///etc/passwd', 'https://user:pass@example.com']) {
    assert.throws(() => parseTargetUrl(url), TargetValidationError);
  }
});

test('blocks localhost, metadata hosts, and private or link-local addresses', () => {
  for (const url of [
    'http://localhost',
    'http://service.localhost',
    'http://metadata.google.internal',
    'http://10.1.2.3',
    'http://172.20.0.1',
    'http://169.254.169.254',
    'http://168.63.129.16',
    'http://[::1]',
    'http://[fd00::1]',
    'http://[::ffff:127.0.0.1]'
  ]) {
    assert.throws(() => parseTargetUrl(url), TargetValidationError, url);
  }
});

test('blocks private IPv4 addresses encoded as IPv4-mapped IPv6 DNS answers', async () => {
  await assert.rejects(
    resolvePublicAddresses(parseTargetUrl('https://mapped.example'), async () => [
      { address: '::ffff:7f00:1', family: 6 }
    ]),
    TargetValidationError
  );
});

test('rejects hostnames that resolve to any private address', async () => {
  await assert.rejects(
    resolvePublicAddresses(parseTargetUrl('https://rebound.example'), async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 }
    ]),
    TargetValidationError
  );
});

test('allows and returns public DNS addresses for request pinning', async () => {
  const addresses = await resolvePublicAddresses(
    parseTargetUrl('https://public.example'),
    async () => [{ address: '93.184.216.34', family: 4 }]
  );
  assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]);
});

test('validates public monitor targets and rejects private DNS resolutions', async () => {
  const publicTarget = await validateTargetUrl('https://public.example', async () => [
    { address: '93.184.216.34', family: 4 }
  ]);
  assert.equal(publicTarget.hostname, 'public.example');

  await assert.rejects(
    validateTargetUrl('https://private.example', async () => [
      { address: '10.0.0.2', family: 4 }
    ]),
    TargetValidationError
  );
});
