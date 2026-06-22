const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { CreatorCardMessages } = require('@app/messages');
const CreatorCardRepository = require('@app/repository/creator-card');
const { serializeCreatorCardForMutation } = require('./serialize-creator-card');
const { validateDeleteCreatorCardPayload } = require('./validation');

function throwCreatorCardNotFoundError() {
  throwAppError(CreatorCardMessages.CREATOR_CARD_NOT_FOUND, ERROR_CODE.NF01);
}

async function deleteCreatorCard({ slug, payload }) {
  const { creator_reference: creatorReference } = validateDeleteCreatorCardPayload(payload);
  const card = await CreatorCardRepository.findOne({
    query: {
      slug,
      creator_reference: creatorReference,
      deleted: null,
    },
  });

  if (!card) {
    throwCreatorCardNotFoundError();
  }

  const result = await CreatorCardRepository.updateOne({
    query: {
      _id: card._id,
      deleted: null,
    },
    updateValues: {
      deleted: Date.now(),
    },
  });

  if (!result.modifiedCount) {
    throwCreatorCardNotFoundError();
  }

  const deletedCard = await CreatorCardRepository.findOne({
    query: { _id: card._id },
  });

  if (!deletedCard) {
    throwCreatorCardNotFoundError();
  }

  return serializeCreatorCardForMutation(deletedCard);
}

module.exports = deleteCreatorCard;
