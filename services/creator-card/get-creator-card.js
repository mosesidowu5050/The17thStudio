const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const CreatorCardMessages = require('@app/messages/creator-card');
const creatorCardRepository = require('@app/repository/creator-card');
const { serializeCard } = require('./create-creator-card');

// ---------------------------------------------------------------------------
// VSL spec — slug comes from the URL path param; access_code from query string
// ---------------------------------------------------------------------------
const spec = `root {
  slug string<trim|minLength:1>
  access_code? string<trim>
}`;

const parsedSpec = validator.parse(spec);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

async function getCreatorCard(serviceData) {
  let response;

  const data = validator.validate(serviceData, parsedSpec);

  try {
    // Access Rule 1 — Card must exist and not be deleted
    const card = await creatorCardRepository.findOne({
      query: { slug: data.slug, deleted: null },
    });

    if (!card) {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NOTFOUND, {
        businessCode: 'NF01',
      });
    }

    // Access Rule 2 — Draft cards are NOT publicly retrievable
    // NF02 uses the same 404 HTTP status as NF01 but distinct code so callers
    // can distinguish "does not exist" from "exists but is a draft"
    if (card.status === 'draft') {
      throwAppError(CreatorCardMessages.CARD_IS_DRAFT, ERROR_CODE.NOTFOUND, {
        businessCode: 'NF02',
      });
    }

    // Access Rule 3 & 4 — Private card access control
    if (card.access_type === 'private') {
      // Rule 3: access_code query param is required
      if (!data.access_code) {
        throwAppError(CreatorCardMessages.CARD_PRIVATE_NO_CODE, ERROR_CODE.PERMERR, {
          businessCode: 'AC03',
        });
      }

      // Rule 4: supplied access_code must match the stored one
      if (data.access_code !== card.access_code) {
        throwAppError(CreatorCardMessages.INVALID_ACCESS_CODE, ERROR_CODE.PERMERR, {
          businessCode: 'AC04',
        });
      }
    }

    // access_code is NEVER included in retrieval responses
    response = serializeCard(card, { includeAccessCode: false });
  } catch (err) {
    appLogger.errorX(err, 'get-creator-card-error');
    throw err;
  }

  return response;
}

module.exports = getCreatorCard;
