const { createCreatorCardWithSlugRetry } = require('./slug');
const { serializeCreatorCardForMutation } = require('./serialize-creator-card');
const { validateCreateCreatorCardPayload } = require('./validation');

async function createCreatorCard(payload) {
  const cardData = validateCreateCreatorCardPayload(payload);
  const createdCard = await createCreatorCardWithSlugRetry(cardData);

  return serializeCreatorCardForMutation(createdCard);
}

module.exports = createCreatorCard;
