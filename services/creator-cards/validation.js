const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { CreatorCardMessages } = require('@app/messages');

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SLUG_CHARACTERS = `${LETTERS}${NUMBERS}-_`;
const ACCESS_CODE_CHARACTERS = `${LETTERS}${NUMBERS}`;

const createCreatorCardSpec = `root {
  title string<lengthBetween:3,100>
  description? string<maxLength:500>
  slug? string<lengthBetween:5,50>
  creator_reference string<length:20>
  links[]? {
    title string<lengthBetween:1,100>
    url string<maxLength:200>
  }
  service_rates? {
    currency string(NGN|USD|GBP|GHS)
    rates[] {
      name string<lengthBetween:3,100>
      description string<maxLength:250>
      amount number<min:1>
    }
  }
  status string(draft|published)
  access_type? string(public|private)
  access_code? string<length:6>
}`;

const deleteCreatorCardSpec = `root {
  creator_reference string<length:20>
}`;

const parsedCreateCreatorCardSpec = validator.parse(createCreatorCardSpec);
const parsedDeleteCreatorCardSpec = validator.parse(deleteCreatorCardSpec);

function throwFieldValidationError(field, message) {
  throwAppError(message, 'SPCL_VALIDATION', {
    details: {
      [field]: message,
    },
  });
}

function containsOnly(value, allowedCharacters) {
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (!allowedCharacters.includes(character)) {
      return false;
    }
  }

  return true;
}

function validateSlugFormat(slug, field = 'slug') {
  if (!containsOnly(slug, SLUG_CHARACTERS)) {
    throwFieldValidationError(
      field,
      `${field} can only contain letters, numbers, hyphens, and underscores`
    );
  }
}

function validateAccessCodeFormat(accessCode, field = 'access_code') {
  if (!containsOnly(accessCode, ACCESS_CODE_CHARACTERS)) {
    throwFieldValidationError(field, `${field} must be exactly 6 alphanumeric characters`);
  }
}

function validateUrlFormat(url, field) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throwFieldValidationError(field, `${field} must start with http:// or https://`);
  }
}

function validateServiceRateAmount(amount, field) {
  if (!Number.isInteger(amount)) {
    throwFieldValidationError(field, `${field} must be a positive integer`);
  }
}

function validateLinks(links = []) {
  links.forEach((link, index) => {
    validateUrlFormat(link.url, `links[${index}].url`);
  });
}

function validateServiceRates(serviceRates) {
  if (!serviceRates) return;

  serviceRates.rates.forEach((rate, index) => {
    validateServiceRateAmount(rate.amount, `service_rates.rates[${index}].amount`);
  });
}

function validateAccessCodeRules(cardData) {
  if (cardData.access_type === 'private' && typeof cardData.access_code === 'undefined') {
    throwAppError(CreatorCardMessages.PRIVATE_ACCESS_CODE_REQUIRED, ERROR_CODE.AC01);
  }

  if (cardData.access_type === 'public' && typeof cardData.access_code !== 'undefined') {
    throwAppError(CreatorCardMessages.PUBLIC_ACCESS_CODE_NOT_ALLOWED, ERROR_CODE.AC05);
  }

  if (typeof cardData.access_code !== 'undefined') {
    validateAccessCodeFormat(cardData.access_code);
  }
}

function validateCreateCreatorCardPayload(payload) {
  const cardData = validator.validate(payload, parsedCreateCreatorCardSpec);

  cardData.access_type = cardData.access_type || 'public';

  if (cardData.slug) {
    validateSlugFormat(cardData.slug);
  }

  validateLinks(cardData.links);
  validateServiceRates(cardData.service_rates);
  validateAccessCodeRules(cardData);

  return cardData;
}

function validateDeleteCreatorCardPayload(payload) {
  return validator.validate(payload, parsedDeleteCreatorCardSpec);
}

module.exports = {
  validateAccessCodeFormat,
  validateCreateCreatorCardPayload,
  validateDeleteCreatorCardPayload,
  validateServiceRateAmount,
  validateSlugFormat,
  validateUrlFormat,
};
