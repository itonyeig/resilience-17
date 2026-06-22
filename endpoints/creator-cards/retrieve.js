const { createHandler } = require('@app-core/server');
const { appLogger } = require('@app-core/logger');
const { CreatorCardMessages } = require('@app/messages');
const retrieveCreatorCard = require('@app/services/creator-cards/retrieve');

module.exports = createHandler({
  path: '/creator-cards/:slug',
  method: 'get',
  middlewares: [],
  async onResponseEnd(rc, rs) {
    appLogger.info({ requestContext: rc, response: rs }, 'retrieve-creator-card-request-completed');
  },
  async handler(rc, helpers) {
    const response = await retrieveCreatorCard({
      slug: rc.params.slug,
      accessCode: rc.query.access_code,
    });

    return {
      status: helpers.http_statuses.HTTP_200_OK,
      message: CreatorCardMessages.CREATOR_CARD_RETRIEVED,
      data: response,
    };
  },
});
