const { ModelSchema, SchemaTypes, DatabaseModel } = require('@app-core/mongoose');

const modelName = 'creator_cards';

/**
 * @typedef {Object} CreatorCardModel
 * @property {String} _id       - ULID
 * @property {String} title
 * @property {String} description
 * @property {String} slug      - unique public identifier
 * @property {String} creator_reference
 * @property {Array}  links
 * @property {Object} service_rates
 * @property {String} status    - draft | published
 * @property {String} access_type - public | private
 * @property {String} access_code  - 6-char alphanumeric, only for private cards
 * @property {Number} created
 * @property {Number} updated
 * @property {Number|null} deleted
 */

const schemaConfig = {
  _id: { type: SchemaTypes.ULID, required: true },
  title: { type: SchemaTypes.String, required: true },
  description: { type: SchemaTypes.String, default: null },
  slug: { type: SchemaTypes.String, required: true },
  creator_reference: { type: SchemaTypes.String, required: true },
  links: { type: SchemaTypes.Array, default: [] },
  service_rates: { type: SchemaTypes.Mixed, default: null },
  status: { type: SchemaTypes.String, required: true },
  access_type: { type: SchemaTypes.String, required: true, default: 'public' },
  access_code: { type: SchemaTypes.String, default: null },
  created: { type: SchemaTypes.Number, required: true },
  updated: { type: SchemaTypes.Number, required: true },
  deleted: { type: SchemaTypes.Number, default: null },
};

const modelSchema = new ModelSchema(schemaConfig, { collection: modelName });

// unique index on slug so MongoDB enforces it at the DB level too
modelSchema.index({ slug: 1 }, { unique: true });

module.exports = DatabaseModel.model(modelName, modelSchema);
