const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const CreatorCardMessages = require('@app/messages/creator-card');
const creatorCardRepository = require('@app/repository/creator-card');
const { serializeCard } = require('./create-creator-card');

// ---------------------------------------------------------------------------
// VSL spec
// ---------------------------------------------------------------------------
const spec = `root {
  slug string<trim|minLength:1>
  creator_reference string<trim|length:20>
}`;

const parsedSpec = validator.parse(spec);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

async function deleteCreatorCard(serviceData) {
  let response;

  const data = validator.validate(serviceData, parsedSpec);

  try {
    // Card must exist and not already be deleted
    const card = await creatorCardRepository.findOne({
      query: { slug: data.slug, deleted: null },
    });

    if (!card) {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NOTFOUND, {
        businessCode: 'NF01',
      });
    }

    const deletedAt = Date.now();

    // Soft-delete: stamp the deleted timestamp
    await creatorCardRepository.updateOne({
      query: { _id: card._id },
      updateValues: { deleted: deletedAt },
    });

    // Return deleted card in the same format as the creation response
    // (access_code included — mirrors creation response shape)
    const deletedDoc = {
      ...card,
      deleted: deletedAt,
      updated: deletedAt,
    };

    response = serializeCard(deletedDoc, { includeAccessCode: true });
  } catch (err) {
    appLogger.errorX(err, 'delete-creator-card-error');
    throw err;
  }

  return response;
}

module.exports = deleteCreatorCard;
