/* eslint-disable prefer-arrow-callback */
const { expect } = require('chai');
const { ERROR_CODE } = require('@app-core/errors');
const {
  ALT_CREATOR_REFERENCE,
  CREATOR_REFERENCE,
  SUFFIX_PATTERN,
  VALID_ACCESS_CODE,
  assertNoMongoMetadata,
  createCreatorCardServer,
  expectErrorEnvelope,
  expectSerializedCardShape,
  expectSuccessEnvelope,
  installInMemoryCreatorCardRepository,
  minimalPayload,
  validPrivatePayload,
  validPublicPayload,
} = require('./helpers');

describe('Creator Card API contract', function () {
  let repository;
  let server;

  beforeEach(function () {
    repository = installInMemoryCreatorCardRepository();
    server = createCreatorCardServer();
  });

  afterEach(function () {
    repository.restore();
  });

  async function createCard(payload) {
    return server.post('/creator-cards', { body: payload });
  }

  async function retrieveCard(slug, query = {}) {
    return server.get(`/creator-cards/${slug}`, { query });
  }

  async function deleteCard(slug, body = { creator_reference: CREATOR_REFERENCE }) {
    return server.delete(`/creator-cards/${slug}`, { body });
  }

  describe('the 16 live-assessment cases', function () {
    it('creates a full published public card', async function () {
      const response = await createCard(validPublicPayload());
      const card = expectSuccessEnvelope(response, 'Creator Card Created Successfully.');

      expectSerializedCardShape(card, { includeAccessCode: true });
      expect(card.title).to.equal('George Cooks');
      expect(card.slug).to.equal('george-cooks');
      expect(card.access_type).to.equal('public');
      expect(card.access_code).to.equal(null);
      expect(card.deleted).to.equal(null);
      expect(card.links).to.deep.equal([
        { title: 'YouTube', url: 'https://youtube.com/@georgecooks' },
      ]);
      expect(card.service_rates).to.deep.equal({
        currency: 'NGN',
        rates: [{ name: 'IG Story Post', description: 'One story mention', amount: 5000000 }],
      });
      assertNoMongoMetadata(response.data);
    });

    it('auto-generates a slug from the title', async function () {
      const response = await createCard(minimalPayload());
      const card = expectSuccessEnvelope(response, 'Creator Card Created Successfully.');

      expect(card.slug).to.equal('ada-designs-things');
      expect(card.access_type).to.equal('public');
      expect(card.access_code).to.equal(null);
      expectSerializedCardShape(card, { includeAccessCode: true });
    });

    it('creates a private card and returns the creator access code', async function () {
      const response = await createCard(validPrivatePayload());
      const card = expectSuccessEnvelope(response, 'Creator Card Created Successfully.');

      expect(card.access_type).to.equal('private');
      expect(card.access_code).to.equal(VALID_ACCESS_CODE);
      expectSerializedCardShape(card, { includeAccessCode: true });
    });

    it('retrieves a public published card without exposing access_code', async function () {
      await createCard(validPublicPayload());

      const response = await retrieveCard('george-cooks');
      const card = expectSuccessEnvelope(response, 'Creator Card Retrieved Successfully.');

      expect(card).not.to.have.property('access_code');
      expect(card.slug).to.equal('george-cooks');
      expectSerializedCardShape(card);
    });

    it('retrieves a private published card with the correct access code without exposing it', async function () {
      const createResponse = await createCard(validPrivatePayload());
      const createdCard = createResponse.data.data;

      const response = await retrieveCard(createdCard.slug, { access_code: VALID_ACCESS_CODE });
      const card = expectSuccessEnvelope(response, 'Creator Card Retrieved Successfully.');

      expect(card.access_type).to.equal('private');
      expect(card).not.to.have.property('access_code');
      expectSerializedCardShape(card);
    });

    it('soft-deletes a card and returns the mutation serializer shape', async function () {
      await createCard(minimalPayload());

      const response = await server.delete('/creator-cards/ada-designs-things', {
        body: { creator_reference: 'crt_a1b2c3d4e5f6g7h8' },
      });
      const card = expectSuccessEnvelope(response, 'Creator Card Deleted Successfully.');

      expect(card.slug).to.equal('ada-designs-things');
      expect(card.access_code).to.equal(null);
      expect(card.deleted).to.be.a('number');
      expectSerializedCardShape(card, { includeAccessCode: true });
    });

    it('returns SL02 for a duplicate client-provided slug', async function () {
      await createCard(validPublicPayload());

      const response = await createCard(
        validPublicPayload({
          title: 'Another George',
          creator_reference: ALT_CREATOR_REFERENCE,
        })
      );

      expectErrorEnvelope(response, 400, ERROR_CODE.SL02);
    });

    it('returns AC01 when a private card omits access_code', async function () {
      const response = await createCard(
        validPrivatePayload({ title: 'Secret Card', access_code: undefined })
      );

      expectErrorEnvelope(response, 400, ERROR_CODE.AC01);
    });

    it('returns AC05 when a public card supplies access_code', async function () {
      const response = await createCard(validPublicPayload({ access_code: VALID_ACCESS_CODE }));

      expectErrorEnvelope(response, 400, ERROR_CODE.AC05);
    });

    it('returns HTTP 400 for framework VSL validation failures', async function () {
      const response = await createCard(validPublicPayload({ status: 'archived' }));

      expectErrorEnvelope(response, 400, 'SPCL_VALIDATION');
    });

    it('returns NF01 when retrieving a nonexistent card', async function () {
      const response = await retrieveCard('does-not-exist-123');

      expectErrorEnvelope(response, 404, ERROR_CODE.NF01);
    });

    it('returns NF02 when retrieving a draft card', async function () {
      await createCard(validPublicPayload({ slug: 'my-draft-card', status: 'draft' }));

      const response = await retrieveCard('my-draft-card');

      expectErrorEnvelope(response, 404, ERROR_CODE.NF02);
    });

    it('returns AC03 when retrieving a private card without access_code', async function () {
      const createResponse = await createCard(validPrivatePayload());

      const response = await retrieveCard(createResponse.data.data.slug);

      expectErrorEnvelope(response, 403, ERROR_CODE.AC03);
    });

    it('returns AC04 when retrieving a private card with the wrong access_code', async function () {
      const createResponse = await createCard(validPrivatePayload());

      const response = await retrieveCard(createResponse.data.data.slug, { access_code: 'WRONG1' });

      expectErrorEnvelope(response, 403, ERROR_CODE.AC04);
    });

    it('returns NF01 when deleting a nonexistent card', async function () {
      const response = await deleteCard('does-not-exist-123');

      expectErrorEnvelope(response, 404, ERROR_CODE.NF01);
    });

    it('returns NF01 when retrieving a deleted card', async function () {
      await createCard(minimalPayload());
      await server.delete('/creator-cards/ada-designs-things', {
        body: { creator_reference: 'crt_a1b2c3d4e5f6g7h8' },
      });

      const response = await retrieveCard('ada-designs-things');

      expectErrorEnvelope(response, 404, ERROR_CODE.NF01);
    });
  });

  describe('serialization contract', function () {
    it('uses id, never _id or __v, and keeps timestamps in milliseconds', async function () {
      const response = await createCard(validPublicPayload());
      const card = response.data.data;

      expect(card.id).to.be.a('string');
      expect(card.created).to.be.a('number');
      expect(card.updated).to.be.a('number');
      expect(card.deleted).to.equal(null);
      expect(card).not.to.have.property('_id');
      expect(card).not.to.have.property('__v');
      assertNoMongoMetadata(response.data);
    });

    it('omits access_code entirely on public and private retrieval responses', async function () {
      await createCard(validPublicPayload());
      const privateResponse = await createCard(validPrivatePayload());

      const publicRetrieve = await retrieveCard('george-cooks');
      const privateRetrieve = await retrieveCard(privateResponse.data.data.slug, {
        access_code: VALID_ACCESS_CODE,
      });

      expect(publicRetrieve.data.data).not.to.have.property('access_code');
      expect(privateRetrieve.data.data).not.to.have.property('access_code');
    });
  });

  describe('slug generation and uniqueness', function () {
    it('lowercases titles, replaces repeated whitespace, removes unsupported characters, and keeps underscores', async function () {
      const response = await createCard(
        minimalPayload({
          title: '  A__DA   Designs!!! Things  ',
          creator_reference: ALT_CREATOR_REFERENCE,
        })
      );

      expect(response.data.data.slug).to.equal('-a__da-designs-things-');
    });

    it('appends a six-character alphanumeric suffix when the generated base is shorter than five', async function () {
      const response = await createCard(minimalPayload({ title: 'A B', slug: undefined }));
      const card = expectSuccessEnvelope(response, 'Creator Card Created Successfully.');

      expect(card.slug).to.match(SUFFIX_PATTERN);
      expect(card.slug).to.have.length(10);
    });

    it('appends a suffix when the generated base already exists', async function () {
      await createCard(minimalPayload({ title: 'Collision Card', slug: undefined }));

      const response = await createCard(
        minimalPayload({
          title: 'Collision Card',
          creator_reference: ALT_CREATOR_REFERENCE,
          slug: undefined,
        })
      );
      const card = expectSuccessEnvelope(response, 'Creator Card Created Successfully.');

      expect(card.slug).to.match(/^collision-card-[a-f0-9]{6}$/);
      expect(card.slug).not.to.equal('collision-card');
    });

    it('resolves generated duplicate-slug races instead of returning SL02', async function () {
      const payloadA = minimalPayload({ title: 'Race Card', slug: undefined });
      const payloadB = minimalPayload({
        title: 'Race Card',
        creator_reference: ALT_CREATOR_REFERENCE,
        slug: undefined,
      });

      const [responseA, responseB] = await Promise.all([
        createCard(payloadA),
        createCard(payloadB),
      ]);
      const slugs = [responseA.data.data.slug, responseB.data.data.slug];

      expect(responseA.statusCode).to.equal(200);
      expect(responseB.statusCode).to.equal(200);
      expect(new Set(slugs).size).to.equal(2);
      expect(slugs).to.include('race-card');
      expect(slugs.some((slug) => /^race-card-[a-f0-9]{6}$/.test(slug))).to.equal(true);
    });

    it('does not create two cards with the same client-provided slug under simultaneous requests', async function () {
      const payloadA = validPublicPayload({ slug: 'same-client-slug' });
      const payloadB = validPublicPayload({
        title: 'Same Client Slug',
        slug: 'same-client-slug',
        creator_reference: ALT_CREATOR_REFERENCE,
      });

      const responses = await Promise.all([createCard(payloadA), createCard(payloadB)]);
      const statusCodes = responses.map((response) => response.statusCode).sort();

      expect(statusCodes).to.deep.equal([200, 400]);
      expect(
        repository.documents.filter((document) => document.slug === 'same-client-slug')
      ).to.have.length(1);
      expect(responses.find((response) => response.statusCode === 400).data.code).to.equal(
        ERROR_CODE.SL02
      );
    });
  });

  describe('access-control ordering', function () {
    it('checks missing card before access code checks', async function () {
      const response = await retrieveCard('missing-private', { access_code: VALID_ACCESS_CODE });

      expectErrorEnvelope(response, 404, ERROR_CODE.NF01);
    });

    it('checks draft status before missing private access code', async function () {
      await createCard(
        validPrivatePayload({
          slug: 'draft-private',
          status: 'draft',
          access_code: VALID_ACCESS_CODE,
        })
      );

      const response = await retrieveCard('draft-private');

      expectErrorEnvelope(response, 404, ERROR_CODE.NF02);
    });

    it('checks draft status before wrong private access code', async function () {
      await createCard(
        validPrivatePayload({
          slug: 'draft-private',
          status: 'draft',
          access_code: VALID_ACCESS_CODE,
        })
      );

      const response = await retrieveCard('draft-private', { access_code: 'WRONG1' });

      expectErrorEnvelope(response, 404, ERROR_CODE.NF02);
    });

    it('then distinguishes missing and wrong access codes for published private cards', async function () {
      await createCard(validPrivatePayload({ slug: 'published-private' }));

      const missingCode = await retrieveCard('published-private');
      const wrongCode = await retrieveCard('published-private', { access_code: 'WRONG1' });

      expectErrorEnvelope(missingCode, 403, ERROR_CODE.AC03);
      expectErrorEnvelope(wrongCode, 403, ERROR_CODE.AC04);
    });
  });

  describe('delete behavior', function () {
    it('requires creator_reference in the delete body', async function () {
      await createCard(validPublicPayload());

      const response = await server.delete('/creator-cards/george-cooks', { body: {} });

      expectErrorEnvelope(response, 400, 'SPCL_VALIDATION');
    });

    it('returns NF01 when deleting a card with the wrong creator_reference', async function () {
      await createCard(validPublicPayload());

      const response = await deleteCard('george-cooks', {
        creator_reference: ALT_CREATOR_REFERENCE,
      });

      expectErrorEnvelope(response, 404, ERROR_CODE.NF01);
    });

    it('returns NF01 on repeated deletion of the same card', async function () {
      await createCard(validPublicPayload());
      await deleteCard('george-cooks');

      const response = await deleteCard('george-cooks');

      expectErrorEnvelope(response, 404, ERROR_CODE.NF01);
    });
  });

  describe('optional fields', function () {
    it('accepts a minimal valid card with optional fields omitted', async function () {
      const response = await createCard(minimalPayload());
      const card = expectSuccessEnvelope(response, 'Creator Card Created Successfully.');

      expect(card.title).to.equal('Ada Designs Things');
      expect(card).not.to.have.property('description');
      expect(card).not.to.have.property('links');
      expect(card).not.to.have.property('service_rates');
      expectSerializedCardShape(card, { includeAccessCode: true });
    });

    it('accepts an empty optional links array', async function () {
      const response = await createCard(minimalPayload({ links: [] }));

      expect(response.statusCode).to.equal(200);
      expect(response.data.data.links).to.deep.equal([]);
    });
  });
});
