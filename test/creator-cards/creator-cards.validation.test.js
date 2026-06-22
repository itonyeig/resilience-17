/* eslint-disable prefer-arrow-callback, no-use-before-define */
const { expect } = require('chai');
const { ERROR_CODE } = require('@app-core/errors');
const {
  createCreatorCardServer,
  expectErrorEnvelope,
  installInMemoryCreatorCardRepository,
  minimalPayload,
  validPrivatePayload,
  validPublicPayload,
} = require('./helpers');

describe('Creator Card validation', function () {
  let repository;
  let server;

  beforeEach(function () {
    repository = installInMemoryCreatorCardRepository();
    server = createCreatorCardServer();
  });

  afterEach(function () {
    repository.restore();
  });

  async function post(payload) {
    return server.post('/creator-cards', { body: payload });
  }

  const fieldValidationCases = [
    ['title missing', () => validPublicPayload({ title: undefined })],
    ['title wrong type', () => validPublicPayload({ title: 123 })],
    ['title shorter than 3', () => validPublicPayload({ title: 'ab' })],
    ['title longer than 100', () => validPublicPayload({ title: 'a'.repeat(101) })],
    ['description wrong type', () => validPublicPayload({ description: 123 })],
    ['description longer than 500', () => validPublicPayload({ description: 'a'.repeat(501) })],
    ['creator reference missing', () => validPublicPayload({ creator_reference: undefined })],
    ['creator reference shorter than 20', () => validPublicPayload({ creator_reference: 'short' })],
    [
      'creator reference longer than 20',
      () => validPublicPayload({ creator_reference: 'crt_8f2k1m9x4p7w3q5zz' }),
    ],
    ['invalid status', () => validPublicPayload({ status: 'archived' })],
    ['invalid access type', () => validPublicPayload({ access_type: 'friends' })],
    ['access code shorter than 6', () => validPrivatePayload({ access_code: 'A1B2C' })],
    ['access code longer than 6', () => validPrivatePayload({ access_code: 'A1B2C3D' })],
    ['non-alphanumeric access code', () => validPrivatePayload({ access_code: 'A1B2!' })],
    ['links is not an array', () => validPublicPayload({ links: { title: 'YouTube' } })],
    [
      'invalid link title',
      () => validPublicPayload({ links: [{ title: '', url: 'https://x.test' }] }),
    ],
    ['invalid link URL type', () => validPublicPayload({ links: [{ title: 'Link', url: 42 }] })],
    [
      'URL with neither http:// nor https://',
      () => validPublicPayload({ links: [{ title: 'Link', url: 'ftp://x.test' }] }),
    ],
    [
      'URL longer than 200',
      () =>
        validPublicPayload({
          links: [{ title: 'Link', url: `https://example.com/${'a'.repeat(181)}` }],
        }),
    ],
    ['service rates is not an object', () => validPublicPayload({ service_rates: [] })],
    [
      'unsupported currency',
      () => validPublicPayload({ service_rates: { currency: 'EUR', rates: [validRate()] } }),
    ],
    [
      'empty rates array',
      () => validPublicPayload({ service_rates: { currency: 'NGN', rates: [] } }),
    ],
    [
      'missing rate name',
      () =>
        validPublicPayload({
          service_rates: { currency: 'NGN', rates: [validRate({ name: undefined })] },
        }),
    ],
    [
      'rate name too short',
      () =>
        validPublicPayload({
          service_rates: { currency: 'NGN', rates: [validRate({ name: 'AB' })] },
        }),
    ],
    [
      'rate name too long',
      () =>
        validPublicPayload({
          service_rates: { currency: 'NGN', rates: [validRate({ name: 'a'.repeat(101) })] },
        }),
    ],
    [
      'rate description longer than 250',
      () =>
        validPublicPayload({
          service_rates: {
            currency: 'NGN',
            rates: [validRate({ description: 'a'.repeat(251) })],
          },
        }),
    ],
    [
      'missing amount',
      () =>
        validPublicPayload({
          service_rates: { currency: 'NGN', rates: [validRate({ amount: undefined })] },
        }),
    ],
    [
      'zero amount',
      () =>
        validPublicPayload({
          service_rates: { currency: 'NGN', rates: [validRate({ amount: 0 })] },
        }),
    ],
    [
      'negative amount',
      () =>
        validPublicPayload({
          service_rates: { currency: 'NGN', rates: [validRate({ amount: -1 })] },
        }),
    ],
    [
      'decimal amount',
      () =>
        validPublicPayload({
          service_rates: { currency: 'NGN', rates: [validRate({ amount: 10.5 })] },
        }),
    ],
    [
      'non-numeric amount',
      () =>
        validPublicPayload({
          service_rates: { currency: 'NGN', rates: [validRate({ amount: '100' })] },
        }),
    ],
    ['invalid client-provided slug characters', () => validPublicPayload({ slug: 'bad slug!' })],
    ['client-provided slug shorter than 5', () => validPublicPayload({ slug: 'abcd' })],
    ['client-provided slug longer than 50', () => validPublicPayload({ slug: 'a'.repeat(51) })],
  ];

  fieldValidationCases.forEach(([name, payloadFactory]) => {
    it(`returns HTTP 400 for ${name}`, async function () {
      const response = await post(payloadFactory());

      expectErrorEnvelope(response, 400);
      expect(repository.documents).to.have.length(0);
    });
  });

  it('returns AC01 for private cards with no access_code', async function () {
    const response = await post(validPrivatePayload({ access_code: undefined }));

    expectErrorEnvelope(response, 400, ERROR_CODE.AC01);
    expect(repository.documents).to.have.length(0);
  });

  it('returns AC05 when access_code is supplied while access_type is omitted and defaults to public', async function () {
    const response = await post(minimalPayload({ access_code: 'A1B2C3' }));

    expectErrorEnvelope(response, 400, ERROR_CODE.AC05);
  });

  it('returns AC05 when access_code is supplied on an explicit public card', async function () {
    const response = await post(
      validPublicPayload({ access_type: 'public', access_code: 'A1B2C3' })
    );

    expectErrorEnvelope(response, 400, ERROR_CODE.AC05);
  });

  it('accepts all supported service-rate currencies', async function () {
    const currencies = [
      ['NGN', 'crt_ngn1234567890123'],
      ['USD', 'crt_usd1234567890123'],
      ['GBP', 'crt_gbp1234567890123'],
      ['GHS', 'crt_ghs1234567890123'],
    ];

    await Promise.all(
      currencies.map(([currency, creatorReference]) =>
        post(
          minimalPayload({
            title: `Currency ${currency}`,
            creator_reference: creatorReference,
            service_rates: { currency, rates: [validRate()] },
          })
        )
      )
    );

    expect(repository.documents).to.have.length(4);
  });
});

function validRate(overrides = {}) {
  return {
    name: 'IG Story Post',
    description: 'One story mention',
    amount: 5000000,
    ...overrides,
  };
}
