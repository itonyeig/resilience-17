/* eslint-disable prefer-arrow-callback */
const { expect } = require('chai');
const CreatorCardRepository = require('@app/repository/creator-card');
const {
  createCreatorCardServer,
  expectErrorEnvelope,
  installInMemoryCreatorCardRepository,
  requestJson,
  startRealServer,
  validPublicPayload,
} = require('./helpers');

describe('Creator Card robustness', function () {
  describe('real server behavior', function () {
    this.timeout(10000);

    let realServer;

    before(async function () {
      realServer = await startRealServer();
    });

    after(async function () {
      await realServer.stop();
    });

    it('returns JSON for unknown routes', async function () {
      const response = await requestJson({
        port: realServer.port,
        path: '/unknown-route',
      });

      expect(response.statusCode).to.equal(404);
      expect(response.data).to.deep.equal({
        status: 'error',
        message: 'Resource not found.',
      });
    });

    it('returns JSON for malformed JSON and remains alive after repeated failures', async function () {
      const malformedA = await requestJson({
        method: 'POST',
        port: realServer.port,
        path: '/creator-cards',
        rawBody: '{"title":',
      });
      const malformedB = await requestJson({
        method: 'POST',
        port: realServer.port,
        path: '/creator-cards',
        rawBody: '{"title":',
      });
      const stillAlive = await requestJson({
        port: realServer.port,
        path: '/unknown-route',
      });

      [malformedA, malformedB].forEach((response) => {
        expect(response.statusCode).to.equal(400);
        expect(response.data).to.have.property('message').that.is.a('string').and.not.equal('');
      });
      expect(stillAlive.statusCode).to.equal(404);
    });
  });

  describe('mock-server failure handling', function () {
    let repository;
    let server;

    beforeEach(function () {
      repository = installInMemoryCreatorCardRepository();
      server = createCreatorCardServer();
    });

    afterEach(function () {
      repository.restore();
    });

    it('returns HTTP 500 for unexpected internal errors without leaking a stack trace', async function () {
      CreatorCardRepository.create = async function create() {
        throw new Error('database exploded with sensitive stack');
      };

      const response = await server.post('/creator-cards', { body: validPublicPayload() });

      expect(response.statusCode).to.equal(500);
      expect(response.data.status).to.equal('error');
      expect(response.data.message).to.equal('Some error occured.');
      expect(JSON.stringify(response.data)).not.to.include('database exploded');
      expect(JSON.stringify(response.data)).not.to.include('stack');
    });

    it('handles multiple sequential validation failures without crashing later requests', async function () {
      const badTitle = await server.post('/creator-cards', {
        body: validPublicPayload({ title: 'ab' }),
      });
      const badStatus = await server.post('/creator-cards', {
        body: validPublicPayload({ status: 'archived' }),
      });
      const valid = await server.post('/creator-cards', { body: validPublicPayload() });

      expectErrorEnvelope(badTitle, 400, 'SPCL_VALIDATION');
      expectErrorEnvelope(badStatus, 400, 'SPCL_VALIDATION');
      expect(valid.statusCode).to.equal(200);
      expect(repository.documents).to.have.length(1);
    });
  });
});
