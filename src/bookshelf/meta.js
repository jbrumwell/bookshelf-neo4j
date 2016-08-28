/* global Symbol */
import _ from 'lodash';

export default (Bookshelf) => {
  const proto = Bookshelf.Model.prototype;
  const collProto = Bookshelf.Collection.prototype;
  const metaSymbol = Symbol('metadata');

  Bookshelf.Model = Bookshelf.Model.extend({
    constructor(attributes, options = {}) {
      proto.constructor.apply(this, arguments);

      this[metaSymbol] = options.metadata || {};
    },

    unsetMeta(attributes) {
      this[metaSymbol] = _.unset(this[metaSymbol], attributes);

      return this;
    },

    hasMeta(path) {
      return _.has(this[metaSymbol], path);
    },

    getMeta(path, defaultValue) {
      let meta = this[metaSymbol];

      if (path) {
        meta = this.hasMeta(path) ? _.get(meta, path) : defaultValue;
      }

      return meta;
    },

    setMeta(attributes, value, options = {}) {
      const isString = _.isString(attributes);
      const attrs = isString ? {
        [attributes] : value,
      } : attributes;
      const opts = isString ? options : value;

      this[metaSymbol] = _.isPlainObject(opts) && opts.unset ? _.omit(this.metadata, attrs) :
                                                               _.merge(this.metadata, attrs);

      return this;
    },

    clearMeta() {
      this[metaSymbol] = {};
    },
  });

  Bookshelf.Collection = Bookshelf.Collection.extend({
    constructor(attributes, options = {}) {
      collProto.constructor.apply(this, arguments);

      this[metaSymbol] = options.metadata || {};
    },

    unsetMeta(attributes) {
      this[metaSymbol] = _.unset(this[metaSymbol], attributes);

      return this;
    },

    hasMeta(path) {
      return _.has(this[metaSymbol], path);
    },

    getMeta(path, defaultValue) {
      let meta = this[metaSymbol];

      if (path) {
        meta = this.hasMeta(path) ? _.get(meta, path) : defaultValue;
      }

      return meta;
    },

    setMeta(attributes, value, options = {}) {
      const isString = _.isString(attributes);
      const attrs = isString ? {
        [attributes] : value,
      } : attributes;
      const opts = isString ? options : value;

      this[metaSymbol] = _.isPlainObject(opts) && opts.unset ? _.omit(this.metadata, attrs) :
                                                               _.merge(this.metadata, attrs);

      return this;
    },

    clearMeta() {
      this[metaSymbol] = {};
    },
  });
};
