module.exports = {
  // Slug errors
  SLUG_TAKEN: 'Slug is already taken',

  // Access code business rule errors
  ACCESS_CODE_REQUIRED: 'access_code is required when access_type is private',
  ACCESS_CODE_NOT_ALLOWED: 'access_code can only be set on private cards',

  // Retrieval / deletion errors
  CARD_NOT_FOUND: 'Creator card not found',
  CARD_IS_DRAFT: 'Creator card not found',
  CARD_PRIVATE_NO_CODE: 'This card is private. An access code is required',
  INVALID_ACCESS_CODE: 'Invalid access code',
};
