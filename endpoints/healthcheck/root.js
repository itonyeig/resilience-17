const { createHandler } = require('@app-core/server');

module.exports = createHandler({
  path: '/',
  method: 'get',
  middlewares: [],
  async handler() {
    return {
      message: 'OK',
    };
  },
});
