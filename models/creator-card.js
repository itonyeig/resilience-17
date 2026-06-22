const { ModelSchema, SchemaTypes, DatabaseModel } = require('@app-core/mongoose');

const modelName = 'creatorCards';

const linkSchemaConfig = {
  _id: false,
  title: { type: SchemaTypes.String },
  url: { type: SchemaTypes.String },
};

const serviceRateSchemaConfig = {
  _id: false,
  name: { type: SchemaTypes.String },
  description: { type: SchemaTypes.String },
  amount: { type: SchemaTypes.Number },
};

const serviceRatesSchemaConfig = {
  _id: false,
  currency: { type: SchemaTypes.String },
  rates: { type: [serviceRateSchemaConfig], default: undefined },
};

/**
 * @typedef {Object} CreatorCardModel
 * @property {String} _id
 * @property {String} title
 * @property {String} description
 * @property {String} slug
 * @property {String} creator_reference
 * @property {{title: String, url: String}[]} links
 * @property {{currency: String, rates: {name: String, description: String, amount: Number}[]}} service_rates
 * @property {String} status
 * @property {String} access_type
 * @property {String} access_code
 * @property {Number} created
 * @property {Number} updated
 * @property {Number|null} deleted
 */

const schemaConfig = {
  _id: { type: SchemaTypes.ULID, required: true },
  title: { type: SchemaTypes.String, required: true },
  description: { type: SchemaTypes.String },
  slug: { type: SchemaTypes.String, required: true, unique: true },
  creator_reference: { type: SchemaTypes.String, required: true, index: true },
  links: { type: [linkSchemaConfig], default: undefined },
  service_rates: { type: serviceRatesSchemaConfig, default: undefined },
  status: { type: SchemaTypes.String, required: true },
  access_type: { type: SchemaTypes.String, default: 'public' },
  access_code: { type: SchemaTypes.String, default: null },
  created: { type: SchemaTypes.Number, required: true },
  updated: { type: SchemaTypes.Number, required: true },
  deleted: { type: SchemaTypes.Number, default: null, index: true },
};

const modelSchema = new ModelSchema(schemaConfig, { collection: modelName });

/** @type {CreatorCardModel} */
module.exports = DatabaseModel.model(modelName, modelSchema);
