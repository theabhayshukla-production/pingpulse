const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const blockedAddresses = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ['168.63.129.16', 32]
].forEach(([network, prefix]) => blockedAddresses.addSubnet(network, prefix, 'ipv4'));
[
  ['::', 96], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7],
  ['fe80::', 10], ['ff00::', 8]
].forEach(([network, prefix]) => blockedAddresses.addSubnet(network, prefix, 'ipv6'));

class TargetValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TargetValidationError';
    this.code = 'INVALID_TARGET';
    this.statusCode = statusCode;
  }
}

function isBlockedAddress(address) {
  let candidate = address.toLowerCase().replace(/^\[|\]$/g, '');
  let family = net.isIP(candidate);
  if (family === 6) {
    const groups = expandIpv6(candidate);
    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
      candidate = [
        (groups[6] >> 8) & 0xff,
        groups[6] & 0xff,
        (groups[7] >> 8) & 0xff,
        groups[7] & 0xff
      ].join('.');
      family = 4;
    }
  }
  return family !== 4 && family !== 6
    ? true
    : blockedAddresses.check(candidate, family === 4 ? 'ipv4' : 'ipv6');
}

function expandIpv6(address) {
  if (address.includes('.')) {
    const lastColon = address.lastIndexOf(':');
    const octets = address.slice(lastColon + 1).split('.').map(Number);
    if (octets.length === 4 && octets.every((octet) => octet >= 0 && octet <= 255)) {
      const high = ((octets[0] << 8) | octets[1]).toString(16);
      const low = ((octets[2] << 8) | octets[3]).toString(16);
      address = `${address.slice(0, lastColon + 1)}${high}:${low}`;
    }
  }

  const halves = address.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const groups = halves.length === 1
    ? left
    : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return groups.map((group) => Number.parseInt(group, 16));
}

function parseTargetUrl(input) {
  if (typeof input !== 'string' || input.length > 2048 || !input.trim()) {
    throw new TargetValidationError('Enter a valid HTTP or HTTPS URL.');
  }

  let parsed;
  try {
    parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(input.trim())
      ? input.trim()
      : `https://${input.trim()}`);
  } catch {
    throw new TargetValidationError('Enter a valid HTTP or HTTPS URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)
      || !parsed.hostname
      || parsed.username
      || parsed.password) {
    throw new TargetValidationError('Only HTTP(S) URLs without credentials are allowed.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')
      || ['metadata.google.internal', 'metadata.google', 'metadata.azure.internal'].includes(hostname)) {
    throw new TargetValidationError('Local and cloud metadata hosts are not allowed.');
  }
  if (net.isIP(hostname) && isBlockedAddress(hostname)) {
    throw new TargetValidationError('Private, reserved, and link-local IP addresses are not allowed.');
  }

  return parsed;
}

async function resolvePublicAddresses(url, lookup = dns.lookup) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new TargetValidationError('Private, reserved, and link-local IP addresses are not allowed.');
    }
    return [{ address: hostname, family: net.isIP(hostname) }];
  }

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    if (error instanceof TargetValidationError) {
      throw error;
    }
    throw error;
  }
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new TargetValidationError('The host resolves to a private, reserved, or link-local IP address.');
  }
  return addresses;
}

async function validateTargetUrl(input, lookup = dns.lookup) {
  const url = parseTargetUrl(input);
  try {
    await resolvePublicAddresses(url, lookup);
  } catch (error) {
    if (error instanceof TargetValidationError) {
      throw error;
    }
    throw new TargetValidationError('The target host could not be resolved.');
  }
  return url;
}

function requestOnce(url, addresses) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const pinnedAddress = addresses[0];
    const request = transport.request(url, {
      method: 'GET',
      rejectUnauthorized: false,
      timeout: REQUEST_TIMEOUT_MS,
      lookup(hostname, options, callback) {
        if (options && options.all) {
          callback(null, addresses);
          return;
        }
        callback(null, pinnedAddress.address, pinnedAddress.family);
      }
    }, (response) => {
      response.resume();
      const certificate = url.protocol === 'https:'
        ? response.socket.getPeerCertificate()
        : null;
      const expirationTime = certificate && Date.parse(certificate.valid_to);
      const issuer = certificate && certificate.issuer;
      resolve({
        statusCode: response.statusCode || null,
        sslValid: Boolean(url.protocol === 'https:'
          && response.socket.authorized
          && Number.isFinite(expirationTime)
          && expirationTime > Date.now()),
        expiresInDays: Number.isFinite(expirationTime)
          ? Math.max(0, Math.ceil((expirationTime - Date.now()) / DAY_IN_MS))
          : null,
        issuer: url.protocol !== 'https:'
          ? 'Not applicable'
          : issuer && (issuer.CN || issuer.O) || 'Unavailable',
        sslError: url.protocol === 'https:' && response.socket.authorizationError
          ? String(response.socket.authorizationError)
          : null,
        response
      });
    });

    const timeout = setTimeout(() => request.destroy(Object.assign(
      new Error('Target request timed out.'),
      { code: 'ETIMEDOUT' }
    )), REQUEST_TIMEOUT_MS);
    request.once('response', () => clearTimeout(timeout));
    request.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    request.end();
  });
}

function offlineResult(url, startTime, error) {
  return {
    url: url.href,
    status: 'OFFLINE',
    statusCode: null,
    responseTimeMs: Date.now() - startTime,
    isOnline: false,
    sslValid: false,
    expiresInDays: null,
    sslDaysLeft: null,
    issuer: url.protocol === 'https:' ? 'Unavailable' : 'Not applicable',
    sslError: url.protocol === 'https:' ? error.message : null,
    error: error.message,
    errorMsg: error.message,
    timestamp: new Date().toISOString()
  };
}

async function checkUrl(input) {
  let target = parseTargetUrl(input);
  const startTime = Date.now();

  try {
    let redirects = 0;
    while (true) {
      const addresses = await resolvePublicAddresses(target);
      const result = await requestOnce(target, addresses);
      const location = result.response.headers.location;
      result.response.destroy();

      if (result.statusCode >= 300 && result.statusCode < 400 && location) {
        if (redirects >= MAX_REDIRECTS) {
          throw new Error('Target exceeded the maximum of three redirects.');
        }
        target = parseTargetUrl(new URL(location, target).href);
        redirects += 1;
        continue;
      }

      const isOnline = result.statusCode >= 200 && result.statusCode < 300;
      return {
        url: target.href,
        status: isOnline ? 'ONLINE' : 'DEGRADED',
        statusCode: result.statusCode,
        responseTimeMs: Date.now() - startTime,
        isOnline,
        sslValid: result.sslValid,
        expiresInDays: result.expiresInDays,
        sslDaysLeft: result.expiresInDays,
        issuer: result.issuer,
        sslError: result.sslError,
        error: null,
        errorMsg: null,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    if (error instanceof TargetValidationError) {
      throw error;
    }
    return offlineResult(target, startTime, error);
  }
}

module.exports = {
  TargetValidationError,
  checkUrl,
  parseTargetUrl,
  resolvePublicAddresses,
  validateTargetUrl
};
