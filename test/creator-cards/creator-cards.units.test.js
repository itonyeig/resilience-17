/* eslint-disable prefer-arrow-callback */
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { ERROR_CODE } = require('@app-core/errors');
const { redact } = require('@app-core/security');
const {
  serializeCreatorCardForMutation,
  serializeCreatorCardForRetrieval,
} = require('@app/services/creator-cards/serialize-creator-card');
const CreatorCard = require('@app/models/creator-card');
const {
  appendRandomSuffix,
  createCreatorCardWithSlugRetry,
  generateBaseSlug,
  isDuplicateSlugError,
  resolveCreatorCardSlug,
} = require('@app/services/creator-cards/slug');
const {
  validateAccessCodeFormat,
  validateSlugFormat,
  validateUrlFormat,
} = require('@app/services/creator-cards/validation');
const { SUFFIX_PATTERN } = require('./helpers');

describe('Creator Card service units', function () {
  const redactResponse = redact();

  describe('model schema', function () {
    it('does not create nested _id values for embedded links and service rates', function () {
      const document = new CreatorCard({
        _id: '01JY5R5D2DRFG4VBQZ51PH7Z8V',
        title: 'Model Metadata Card',
        slug: 'model-metadata-card',
        creator_reference: 'crt_8f2k1m9x4p7w3q5z',
        links: [{ title: 'Website', url: 'https://example.com' }],
        service_rates: {
          currency: 'USD',
          rates: [{ name: 'Consulting', description: 'One call', amount: 10000 }],
        },
        status: 'published',
        access_type: 'public',
        created: 1767052800000,
        updated: 1767052800000,
        deleted: null,
      });

      const card = document.toObject({ versionKey: false });

      expect(card.links[0]).not.to.have.property('_id');
      expect(card.service_rates.rates[0]).not.to.have.property('_id');
    });

    it('does not materialize omitted optional arrays or service rates', function () {
      const document = new CreatorCard({
        _id: '01JY5R5D2DRFG4VBQZ51PH7Z8V',
        title: 'Minimal Model Card',
        slug: 'minimal-model-card',
        creator_reference: 'crt_8f2k1m9x4p7w3q5z',
        status: 'published',
        access_type: 'public',
        created: 1767052800000,
        updated: 1767052800000,
        deleted: null,
      });

      const card = document.toObject({ versionKey: false });

      expect(card).not.to.have.property('links');
      expect(card).not.to.have.property('service_rates');
    });
  });

  describe('serializer', function () {
    it('converts _id to id and serializes documented mutation response fields', function () {
      const card = serializeCreatorCardForMutation({
        _id: '01JY5R5D2DRFG4VBQZ51PH7Z8V',
        __v: 0,
        title: 'Metadata Card',
        description: 'Has optional response fields',
        slug: 'metadata-card',
        creator_reference: 'crt_8f2k1m9x4p7w3q5z',
        links: [
          {
            title: 'Website',
            url: 'https://example.com',
          },
        ],
        service_rates: {
          currency: 'USD',
          rates: [
            {
              name: 'Consulting',
              description: 'One call',
              amount: 10000,
            },
          ],
        },
        status: 'published',
        access_type: 'private',
        access_code: 'A1B2C3',
        created: 1767052800000,
        updated: 1767052800000,
        deleted: null,
      });

      expect(card.id).to.equal('01JY5R5D2DRFG4VBQZ51PH7Z8V');
      expect(card.access_code).to.equal('A1B2C3');
      expect(card.links).to.deep.equal([{ title: 'Website', url: 'https://example.com' }]);
      expect(card.service_rates).to.deep.equal({
        currency: 'USD',
        rates: [{ name: 'Consulting', description: 'One call', amount: 10000 }],
      });
    });

    it('omits access_code entirely for retrieval responses', function () {
      const card = serializeCreatorCardForRetrieval({
        _id: '01JY5R5D2DRFG4VBQZ51PH7Z8V',
        title: 'Private Card',
        slug: 'private-card',
        creator_reference: 'crt_8f2k1m9x4p7w3q5z',
        status: 'published',
        access_type: 'private',
        access_code: 'A1B2C3',
        created: 1767052800000,
        updated: 1767052800000,
        deleted: null,
      });

      expect(card).not.to.have.property('access_code');
    });

    it('omits optional fields that are not present on the card', function () {
      const card = serializeCreatorCardForMutation({
        _id: '01JY5R5D2DRFG4VBQZ51PH7Z8V',
        title: 'Minimal Card',
        slug: 'minimal-card',
        creator_reference: 'crt_8f2k1m9x4p7w3q5z',
        status: 'published',
        access_type: 'public',
        created: 1767052800000,
        updated: 1767052800000,
        deleted: null,
      });

      expect(card).not.to.have.property('description');
      expect(card).not.to.have.property('links');
      expect(card).not.to.have.property('service_rates');
    });

    it('normalizes raw Mongoose _doc nested values before they reach response redaction', function () {
      const document = new CreatorCard({
        _id: '01JY5R5D2DRFG4VBQZ51PH7Z8V',
        title: 'Raw Doc Card',
        slug: 'raw-doc-card',
        creator_reference: 'crt_8f2k1m9x4p7w3q5z',
        links: [{ title: 'Website', url: 'https://example.com' }],
        service_rates: {
          currency: 'USD',
          rates: [{ name: 'Consulting', description: 'One call', amount: 10000 }],
        },
        status: 'published',
        access_type: 'public',
        created: 1767052800000,
        updated: 1767052800000,
        deleted: null,
      });

      const card = serializeCreatorCardForMutation(document._doc);

      expect(() => redactResponse({ data: card })).not.to.throw();
      expect(card.links).to.deep.equal([{ title: 'Website', url: 'https://example.com' }]);
      expect(card.service_rates).to.deep.equal({
        currency: 'USD',
        rates: [{ name: 'Consulting', description: 'One call', amount: 10000 }],
      });
    });
  });

  describe('slug helpers', function () {
    it('generates ordinary title slugs by lowercasing, hyphenating whitespace, removing unsupported characters, and preserving underscores', function () {
      expect(generateBaseSlug('Ada Designs Things')).to.equal('ada-designs-things');
      expect(generateBaseSlug('  Ada   Designs\tThings  ')).to.equal('-ada-designs-things-');
      expect(generateBaseSlug('Ada_Designs!!! Things')).to.equal('ada_designs-things');
    });

    it('appends a random six-character suffix without exceeding slug length limits', function () {
      const slug = appendRandomSuffix('a'.repeat(50));

      expect(slug).to.match(SUFFIX_PATTERN);
      expect(slug).to.have.length(50);
    });

    it('resolves a client-provided duplicate slug as SL02', async function () {
      const repository = {
        findOne: async () => ({ _id: 'existing' }),
      };

      try {
        await resolveCreatorCardSlug({ title: 'Existing', slug: 'existing-slug' }, repository);
        throw new Error('Expected resolveCreatorCardSlug to throw');
      } catch (error) {
        expect(error.errorCode).to.equal(ERROR_CODE.SL02);
      }
    });

    it('treats raw Mongo slug duplicate errors and repository-wrapped duplicates as duplicate slug errors', function () {
      const rawMongoError = new Error('duplicate');
      rawMongoError.code = 11000;
      rawMongoError.keyPattern = { slug: 1 };

      const wrappedError = new Error('duplicate');
      wrappedError.errorCode = ERROR_CODE.DUPLRCRD;

      expect(isDuplicateSlugError(rawMongoError)).to.equal(true);
      expect(isDuplicateSlugError(wrappedError)).to.equal(true);
      expect(isDuplicateSlugError(new Error('different'))).to.equal(false);
    });

    it('retries repeated generated slug duplicate races with new suffixes', async function () {
      let createAttempts = 0;
      const usedSlugs = [];
      const repository = {
        findOne: async () => null,
        create: async (data) => {
          createAttempts += 1;
          usedSlugs.push(data.slug);

          if (createAttempts < 3) {
            const error = new Error('duplicate');
            error.errorCode = ERROR_CODE.DUPLRCRD;
            throw error;
          }

          return {
            _id: '01JY5R5D2DRFG4VBQZ51PH7Z8V',
            ...data,
          };
        },
      };

      const card = await createCreatorCardWithSlugRetry(
        { title: 'Repeated Collision', creator_reference: 'crt_8f2k1m9x4p7w3q5z' },
        { repository, maxAttempts: 4 }
      );

      expect(card.slug).to.match(/^repeated-collision-[a-f0-9]{6}$/);
      expect(createAttempts).to.equal(3);
      expect(new Set(usedSlugs).size).to.equal(3);
    });
  });

  describe('manual field validators', function () {
    it('rejects invalid slug characters with a field-validation error', function () {
      expect(() => validateSlugFormat('bad slug!')).to.throw('slug can only contain');
    });

    it('rejects non-alphanumeric access codes with a field-validation error', function () {
      expect(() => validateAccessCodeFormat('ABC12!')).to.throw(
        'access_code must be exactly 6 alphanumeric characters'
      );
    });

    it('rejects URLs that do not start with http:// or https://', function () {
      expect(() => validateUrlFormat('ftp://example.com', 'links[0].url')).to.throw(
        'links[0].url must start with http:// or https://'
      );
    });
  });

  describe('template convention checks', function () {
    it('does not use regex literals or RegExp.test in Creator Card service implementation', function () {
      const files = ['services/creator-cards/slug.js', 'services/creator-cards/validation.js'];

      files.forEach((file) => {
        const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

        expect(source, `${file} should not contain regex literals`).not.to.include('/^');
        expect(source, `${file} should not contain regex literals`).not.to.include('/g');
        expect(source, `${file} should not call .test()`).not.to.include('.test(');
      });
    });
  });
});
