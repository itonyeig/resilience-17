const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { CreatorCardMessages } = require('@app/messages');
const CreatorCardRepository = require('@app/repository/creator-card');
const { serializeCreatorCardForRetrieval } = require('./serialize-creator-card');

function throwCreatorCardNotFoundError(errorCode) {
  throwAppError(CreatorCardMessages.CREATOR_CARD_NOT_FOUND, errorCode);
}

async function retrieveCreatorCard({ slug, accessCode }) {
  const card = await CreatorCardRepository.findOne({
    query: { slug, deleted: null },
  });

  if (!card) {
    throwCreatorCardNotFoundError(ERROR_CODE.NF01);
  }

  if (card.status === 'draft') {
    throwCreatorCardNotFoundError(ERROR_CODE.NF02);
  }

  if (card.access_type === 'private' && !accessCode) {
    throwAppError(CreatorCardMessages.PRIVATE_CARD_ACCESS_CODE_REQUIRED, ERROR_CODE.AC03);
  }

  if (card.access_type === 'private' && card.access_code !== accessCode) {
    throwAppError(CreatorCardMessages.INVALID_ACCESS_CODE, ERROR_CODE.AC04);
  }

  return serializeCreatorCardForRetrieval(card);
}

module.exports = retrieveCreatorCard;
