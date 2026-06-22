function toCreatorCardObject(card) {
  if (typeof card.toObject === 'function') {
    return card.toObject({ versionKey: false });
  }

  return card._doc || card;
}

function toPlainValue(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (typeof value.toObject === 'function') {
    return value.toObject({ versionKey: false });
  }

  return value;
}

function serializeCreatorCard(card, { includeAccessCode = false } = {}) {
  if (!card) return null;

  const cardData = toCreatorCardObject(card);
  const links = toPlainValue(cardData.links);
  const serviceRates = toPlainValue(cardData.service_rates);

  return {
    id: String(cardData._id),
    title: cardData.title,
    ...(typeof cardData.description !== 'undefined' ? { description: cardData.description } : {}),
    slug: cardData.slug,
    creator_reference: cardData.creator_reference,
    ...(typeof links !== 'undefined' ? { links } : {}),
    ...(typeof serviceRates !== 'undefined' ? { service_rates: serviceRates } : {}),
    status: cardData.status,
    access_type: cardData.access_type,
    ...(includeAccessCode ? { access_code: cardData.access_code ?? null } : {}),
    created: cardData.created,
    updated: cardData.updated,
    deleted: cardData.deleted ?? null,
  };
}

function serializeCreatorCardForMutation(card) {
  return serializeCreatorCard(card, { includeAccessCode: true });
}

function serializeCreatorCardForRetrieval(card) {
  return serializeCreatorCard(card);
}

module.exports = {
  serializeCreatorCard,
  serializeCreatorCardForMutation,
  serializeCreatorCardForRetrieval,
};
