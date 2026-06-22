const { expect } = require('chai');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const createMockServer = require('@app-core/mock-server');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { ulid } = require('@app-core/randomness');
const CreatorCardRepository = require('@app/repository/creator-card');

const CREATOR_REFERENCE = 'crt_8f2k1m9x4p7w3q5z';
const PRIVATE_CREATOR_REFERENCE = 'crt_x9y8z7w6v5u4t3s2';
const ALT_CREATOR_REFERENCE = 'crt_m1n2b3v4c5x6z7l8';
const VALID_ACCESS_CODE = 'A1B2C3';
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const SUFFIX_PATTERN = /^[a-z0-9_-]+-[a-f0-9]{6}$/;

const originalRepositoryMethods = {
  create: CreatorCardRepository.create,
  findOne: CreatorCardRepository.findOne,
  findMany: CreatorCardRepository.findMany,
  updateOne: CreatorCardRepository.updateOne,
  deleteOne: CreatorCardRepository.deleteOne,
  raw: CreatorCardRepository.raw,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matchesQuery(document, query = {}) {
  return Object.entries(query).every(([key, value]) => document[key] === value);
}

function throwDuplicateSlug() {
  throwAppError('An existing slug record exists.', ERROR_CODE.DUPLRCRD);
}

function installInMemoryCreatorCardRepository() {
  const documents = [];

  CreatorCardRepository.create = async function create(data) {
    if (documents.some((document) => document.slug === data.slug)) {
      throwDuplicateSlug();
    }

    const now = Date.now();
    const document = {
      ...clone(data),
      _id: data._id || ulid(),
      created: data.created || now,
      updated: data.updated || now,
      deleted: Object.hasOwn(data, 'deleted') ? data.deleted : null,
    };

    documents.push(document);
    return clone(document);
  };

  CreatorCardRepository.findOne = async function findOne({ query = {}, projections } = {}) {
    const found = documents.find((document) => matchesQuery(document, query));

    if (!found) return null;

    if (projections) {
      const projected = {};
      Object.keys(projections).forEach((key) => {
        projected[key] = found[key];
      });
      return clone(projected);
    }

    return clone(found);
  };

  CreatorCardRepository.findMany = async function findMany({ query = {} } = {}) {
    return documents.filter((document) => matchesQuery(document, query)).map(clone);
  };

  CreatorCardRepository.updateOne = async function updateOne({
    query = {},
    updateValues = {},
  } = {}) {
    const found = documents.find((document) => matchesQuery(document, query));

    if (!found) {
      return { acknowledged: true, modifiedCount: 0 };
    }

    Object.assign(found, clone(updateValues), { updated: Date.now() });
    return { acknowledged: true, modifiedCount: 1 };
  };

  CreatorCardRepository.deleteOne = async function deleteOne({ query = {} } = {}) {
    const index = documents.findIndex((document) => matchesQuery(document, query));

    if (index === -1) {
      return { deletedCount: 0 };
    }

    documents.splice(index, 1);
    return { deletedCount: 1 };
  };

  CreatorCardRepository.raw = function raw() {
    return {
      countDocuments: async (query = {}) =>
        documents.filter((document) => matchesQuery(document, query)).length,
    };
  };

  return {
    documents,
    seed(document) {
      documents.push({
        _id: ulid(),
        title: 'Seeded Creator Card',
        creator_reference: CREATOR_REFERENCE,
        slug: `seeded-${documents.length}`,
        status: 'published',
        access_type: 'public',
        access_code: null,
        created: Date.now(),
        updated: Date.now(),
        deleted: null,
        ...clone(document),
      });
    },
    restore() {
      Object.assign(CreatorCardRepository, originalRepositoryMethods);
    },
  };
}

function createCreatorCardServer() {
  return createMockServer(['endpoints/creator-cards']);
}

function validPublicPayload(overrides = {}) {
  return {
    title: 'George Cooks',
    description: 'Weekly cooking podcast',
    slug: 'george-cooks',
    creator_reference: CREATOR_REFERENCE,
    links: [{ title: 'YouTube', url: 'https://youtube.com/@georgecooks' }],
    service_rates: {
      currency: 'NGN',
      rates: [{ name: 'IG Story Post', description: 'One story mention', amount: 5000000 }],
    },
    status: 'published',
    ...overrides,
  };
}

function minimalPayload(overrides = {}) {
  return {
    title: 'Ada Designs Things',
    creator_reference: 'crt_a1b2c3d4e5f6g7h8',
    status: 'published',
    ...overrides,
  };
}

function validPrivatePayload(overrides = {}) {
  return {
    title: 'VIP Rate Card',
    creator_reference: PRIVATE_CREATOR_REFERENCE,
    status: 'published',
    access_type: 'private',
    access_code: VALID_ACCESS_CODE,
    ...overrides,
  };
}

function expectSuccessEnvelope(response, message, statusCode = 200) {
  expect(response.statusCode).to.equal(statusCode);
  expect(response.data).to.have.keys(['status', 'message', 'data']);
  expect(response.data.status).to.equal('success');
  expect(response.data.message).to.equal(message);
  expect(response.data.data).to.be.an('object');
  return response.data.data;
}

function expectErrorEnvelope(response, statusCode, code) {
  expect(response.statusCode).to.equal(statusCode);
  expect(response.data.status).to.equal('error');
  expect(response.data.message).to.be.a('string').and.not.equal('');
  if (code) {
    expect(response.data.code).to.equal(code);
  }
  return response.data;
}

function assertNoMongoMetadata(value, path = 'response') {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoMongoMetadata(entry, `${path}[${index}]`));
    return;
  }

  expect(value, `${path} must not expose _id`).not.to.have.property('_id');
  expect(value, `${path} must not expose __v`).not.to.have.property('__v');

  Object.entries(value).forEach(([key, nestedValue]) => {
    assertNoMongoMetadata(nestedValue, `${path}.${key}`);
  });
}

function expectSerializedCardShape(card, { includeAccessCode = false } = {}) {
  const requiredKeys = [
    'id',
    'title',
    'slug',
    'creator_reference',
    'status',
    'access_type',
    'created',
    'updated',
    'deleted',
  ];

  if (includeAccessCode) {
    requiredKeys.splice(6, 0, 'access_code');
  }

  expect(card).to.include.all.keys(requiredKeys);
  expect(card.id).to.match(ULID_PATTERN);
  expect(card.created).to.be.a('number');
  expect(card.updated).to.be.a('number');
  expect(card.deleted === null || typeof card.deleted === 'number').to.equal(true);
  assertNoMongoMetadata(card);
}

function requestJson({ method = 'GET', port, path = '/', body, rawBody, headers = {} }) {
  return new Promise((resolve, reject) => {
    let payload;

    if (typeof rawBody === 'string') {
      payload = rawBody;
    } else if (typeof body !== 'undefined') {
      payload = JSON.stringify(body);
    }

    const request = http.request(
      {
        method,
        port,
        path,
        hostname: '127.0.0.1',
        headers: {
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (response) => {
        const chunks = [];

        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data;

          try {
            data = text ? JSON.parse(text) : null;
          } catch (error) {
            reject(error);
            return;
          }

          resolve({ statusCode: response.statusCode, data, text });
        });
      }
    );

    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });

    server.on('error', reject);
  });
}

async function waitForServer(port, attempts = 50) {
  try {
    await requestJson({ port, path: '/does-not-exist' });
  } catch (error) {
    if (attempts <= 1) {
      throw new Error(`Server did not start on port ${port}`);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    await waitForServer(port, attempts - 1);
  }
}

async function startRealServer() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['bootstrap.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      MONGODB_URI: '',
      REDIS_URL: '',
      QUEUE_NAME: '',
      USE_MOCK_MODEL: '1',
      PINO_LOG_LEVEL: 'silent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  await waitForServer(port);

  return {
    port,
    output: () => output,
    async stop() {
      if (child.exitCode !== null) return;

      child.kill();
      await new Promise((resolve) => {
        child.once('exit', resolve);
        setTimeout(resolve, 500);
      });
    },
  };
}

module.exports = {
  ALT_CREATOR_REFERENCE,
  CREATOR_REFERENCE,
  PRIVATE_CREATOR_REFERENCE,
  SUFFIX_PATTERN,
  ULID_PATTERN,
  VALID_ACCESS_CODE,
  assertNoMongoMetadata,
  createCreatorCardServer,
  expectErrorEnvelope,
  expectSerializedCardShape,
  expectSuccessEnvelope,
  installInMemoryCreatorCardRepository,
  minimalPayload,
  requestJson,
  startRealServer,
  validPrivatePayload,
  validPublicPayload,
};
