import _ from 'lodash';
import Promise from 'bluebird';

function _handleGraphResponse(response) {
  const isCollection = _.isArray(response);

  let records = _.map(isCollection ? response : [ response ], (record) => {
    if (_.isFunction(record.toObject)) {
      record = record.toObject();
    }

    const instanceName = _.get(record, 'constructor.name');

    switch (instanceName) {
      case 'Node':
        record = {
          ...record.properties,
          graph : {
            type : 'node',
            labels : record.labels,
            id : record.identity.toNumber(),
          },
        };
        break;

      case 'Relationship':
        record = {
          ...record.properties,
          graph : {
            type : 'relationship',
            label : record.type,
            start : record.start.toNumber(),
            end : record.end.toNumber(),
          },
        };
        break;

      default:
    }

    if (_.isPlainObject(record)) {
      record = this.transformIntegers(record);
    }

    return record;
  });

  return isCollection ? records : records[0];
}

function _transformIntegers(record) {
  return _.mapValues(record, (value, key) => {
    const type = _.get(value, 'constructor.name');

    return type && type === 'Integer' ? value.toNumber() : value;
  });
}

export default (Bookshelf) => {
  const proto = Bookshelf.Model.prototype;
  const collProto = Bookshelf.Collection.prototype;

  Bookshelf.Model = Bookshelf.Model.extend({
    constructor(attributes, options = {}) {
      proto.constructor.apply(this, arguments);

      this._bindEvents();
    },

    _bindEvents() {
      const events = [
        'counting',
        'created',
        'creating',
        'destroyed',
        'destroying',
        'fetched',
        'fetching',
        'saved',
        'saving',
        'updated',
        'updating',
      ];
      const toBind = this.graphRelations ? _.pull(events, [ 'fetched', 'fetching' ]) : events;

      _.each(toBind, (event) => {
        const method = this[`on${_.upperFirst(event)}`];

        if (_.isFunction(method)) {
          this.on(event, method.bind(this));
        }
      });

      if (this.graphRelations) {
        this.on('fetching', this._onFetching.bind(this));
        this.on('fetched', this._onFetched.bind(this));
      }
    },

    _fetchGraphRelations(model, relations) {
      return Promise.map(relations, (relation) => {
        return model[relation]()
        .then((response) => {
          model.relations[relation] = response ? this.handleGraphResponse(response) : {};

          return model.relations[relation];
        });
      });
    },

    _onFetching(model, columns, options = {}) {
      const id = model.get('id');
      let promise = Promise.resolve();
      let withGraphRelated = [];

      if (options.withRelated) {
        withGraphRelated = _.intersection(model.graphRelations, options.withRelated);
        options.withRelated = _.pullAll(options.withRelated, withGraphRelated);
      }

      if (withGraphRelated.length) {
        if (id) {
          promise = this._fetchGraphRelations(model, withGraphRelated);
        } else {
          model.setMeta('withGraphRelated', withGraphRelated);
        }
      }

      return promise.then(() => {
        return _.isFunction(model.onFetching) ? model.onFetching(model, columns, options) : null;
      });
    },

    _onFetched(model, columns, options = {}) {
      const withGraphRelated = model.getMeta('withGraphRelated', []);
      const promise = withGraphRelated.length ? this._fetchGraphRelations(model, withGraphRelated) :
                                                Promise.resolve();

      model.unsetMeta('withGraphRelated');

      return promise.then(() => {
        return _.isFunction(model.onFetched) ? model.onFetched(model, columns, options) : null;
      });
    },

    handleGraphResponse(response) {
      return _handleGraphResponse.call(this, response);
    },

    transformIntegers(record) {
      return _transformIntegers(record);
    },

    load(relations, options = {}) {
      relations = _.isArray(relations) ? relations : [ relations ];

      options.withRelated = relations;
      return this.triggerThen('fetching', this, '*', options)
      .then(() => {
        relations = options.withRelated;

        _.unset(options, 'withRelated');

        return relations.length ? proto.load.call(this, relations, options) :
                                  this.triggerThen('fetched', this, '*', options)
                                      .return(this);
      });
    },
  });

  Bookshelf.Collection = Bookshelf.Collection.extend({
    initialize() {
      this.graphRelations = this.model.prototype.graphRelations;

      if (this.graphRelations) {
        this.on('fetching', this._onFetching.bind(this));
        this.on('fetched', this._onFetched.bind(this));
      }
    },

    _fetchGraphRelations(collection, relations) {
      return Promise.map(collection.models, (model) => {
        return model._fetchGraphRelations(model, relations);
      });
    },

    _onFetching(collection, models, options = {}) {
      const hasModels = collection.models.length;
      let promise = Promise.resolve();
      let withGraphRelated = [];

      if (options.withRelated) {
        withGraphRelated = _.intersection(collection.graphRelations, options.withRelated);
        options.withRelated = _.pullAll(options.withRelated, withGraphRelated);
      }

      if (withGraphRelated.length) {
        if (hasModels) {
          promise = this._fetchGraphRelations(collection, withGraphRelated);
        } else {
          collection.setMeta('withGraphRelated', withGraphRelated);
        }
      }

      return promise.then(() => {
        return _.isFunction(collection.onFetching) ? collection.onFetching(collection, options) :
                                                     null;
      });
    },

    _onFetched(collection, models, options = {}) {
      const withGraphRelated = collection.getMeta('withGraphRelated', []);
      const promise = withGraphRelated.length ?
        this._fetchGraphRelations(collection, withGraphRelated) :
        Promise.resolve();

      collection.unsetMeta('withGraphRelated');

      return promise.then(() => {
        return _.isFunction(collection.onFetched) ? collection.onFetched(collection, options) :
                                                    null;
      });
    },

    load(relations, options = {}) {
      relations = _.isArray(relations) ? relations : [ relations ];

      options.withRelated = relations;
      return this.triggerThen('fetching', this, this.models, options)
      .then(() => {
        relations = options.withRelated;

        _.unset(options, 'withRelated');

        return relations.length ? collProto.load.call(this, relations, options) :
                                  this.triggerThen('fetched', this, this.models, options)
                                      .return(this);
      });
    },

    handleGraphResponse(response) {
      return _handleGraphResponse.call(this, response);
    },

    transformIntegers(record) {
      return _transformIntegers(record);
    },
  });
};
