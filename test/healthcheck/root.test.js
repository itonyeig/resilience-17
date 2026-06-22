/* eslint-disable prefer-arrow-callback */
const { expect } = require('chai');
const { requestJson, startRealServer } = require('../creator-cards/helpers');

describe('Healthcheck endpoint', function () {
  this.timeout(10000);

  let server;

  before(async function () {
    server = await startRealServer();
  });

  after(async function () {
    if (server) await server.stop();
  });

  it('returns a simple success response at the root route', async function () {
    const response = await requestJson({ port: server.port, path: '/' });

    expect(response.statusCode).to.equal(200);
    expect(response.data).to.deep.equal({
      status: 'success',
      message: 'OK',
      data: {},
    });
  });
});
