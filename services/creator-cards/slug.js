const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { randomBytes } = require('@app-core/randomness');
const { CreatorCardMessages } = require('@app/messages');
const CreatorCardRepository = require('@app/repository/creator-card');

const MAX_SLUG_LENGTH = 50;
const RANDOM_SUFFIX_LENGTH = 6;
const GENERATED_SLUG_MAX_ATTEMPTS = 5;
const SUFFIX_SEPARATOR_LENGTH = 1;
const MAX_SLUG_PREFIX_LENGTH = MAX_SLUG_LENGTH - RANDOM_SUFFIX_LENGTH - SUFFIX_SEPARATOR_LENGTH;
const WHITESPACE_CHARACTERS = [' ', '\n', '\r', '\t', '\v', '\f'];

function isWhitespaceCharacter(character) {
  return WHITESPACE_CHARACTERS.includes(character);
}

function isLowercaseLetter(character) {
  return character >= 'a' && character <= 'z';
}

function isNumber(character) {
  return character >= '0' && character <= '9';
}

function isAllowedSlugCharacter(character) {
  return (
    isLowercaseLetter(character) || isNumber(character) || character === '-' || character === '_'
  );
}

function replaceWhitespaceSequencesWithHyphen(value) {
  let output = '';
  let previousWasWhitespace = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (isWhitespaceCharacter(character)) {
      if (!previousWasWhitespace) {
        output += '-';
      }

      previousWasWhitespace = true;
    } else {
      output += character;
      previousWasWhitespace = false;
    }
  }

  return output;
}

function removeUnsupportedSlugCharacters(value) {
  let output = '';

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (isAllowedSlugCharacter(character)) {
      output += character;
    }
  }

  return output;
}

function generateBaseSlug(title) {
  const lowercasedTitle = title.toLowerCase();
  const hyphenatedTitle = replaceWhitespaceSequencesWithHyphen(lowercasedTitle);
  return removeUnsupportedSlugCharacters(hyphenatedTitle).substring(0, MAX_SLUG_LENGTH);
}

function appendRandomSuffix(slug) {
  const slugPrefix = slug.substring(0, MAX_SLUG_PREFIX_LENGTH);
  return `${slugPrefix}-${randomBytes(RANDOM_SUFFIX_LENGTH)}`;
}

async function slugExists(slug, repository = CreatorCardRepository) {
  const card = await repository.findOne({
    query: { slug },
    projections: { _id: 1 },
  });

  return !!card;
}

function throwSlugAlreadyTakenError() {
  throwAppError(CreatorCardMessages.SLUG_ALREADY_TAKEN, ERROR_CODE.SL02);
}

function isDuplicateSlugError(error) {
  if (parseInt(error.code, 10) === 11000 && error.keyPattern?.slug) {
    return true;
  }

  return error.errorCode === ERROR_CODE.DUPLRCRD;
}

async function resolveCreatorCardSlug(cardData, repository = CreatorCardRepository) {
  if (cardData.slug) {
    if (await slugExists(cardData.slug, repository)) {
      throwSlugAlreadyTakenError();
    }

    return cardData.slug;
  }

  const baseSlug = generateBaseSlug(cardData.title);
  if (baseSlug.length < 5 || (await slugExists(baseSlug, repository))) {
    return appendRandomSuffix(baseSlug);
  }

  return baseSlug;
}

async function createCreatorCardWithSlugRetry(cardData, options = {}) {
  const {
    createOptions = {},
    maxAttempts = GENERATED_SLUG_MAX_ATTEMPTS,
    repository = CreatorCardRepository,
  } = options;

  const clientProvidedSlug = !!cardData.slug;
  const baseSlug = generateBaseSlug(cardData.title);
  const dataToCreate = {
    ...cardData,
    slug: await resolveCreatorCardSlug(cardData, repository),
  };

  async function createCard(attempt = 1) {
    try {
      return await repository.create(dataToCreate, createOptions);
    } catch (error) {
      if (!isDuplicateSlugError(error)) {
        throw error;
      }

      if (clientProvidedSlug || attempt === maxAttempts) {
        throwSlugAlreadyTakenError();
      }

      dataToCreate.slug = appendRandomSuffix(baseSlug);
      return createCard(attempt + 1);
    }
  }

  return createCard();
}

module.exports = {
  appendRandomSuffix,
  createCreatorCardWithSlugRetry,
  generateBaseSlug,
  isDuplicateSlugError,
  resolveCreatorCardSlug,
  slugExists,
};
