import _ from 'lodash';
import Promise from 'bluebird';

export default (Bookshelf) => {
  const transaction = Bookshelf.transaction.bind(Bookshelf);
  const eventNames = text => text.split(/\s+/);

  Bookshelf.transaction = (cb) => {
    transaction((trx) => {
      let isCompleted = false;
      const methods = [
        'commit',
        'rollback',
      ];

      methods.forEach((name) => {
        const method = trx[name];

        trx[name] = function() {
          const completed = isCompleted;

          isCompleted = true;

          return completed ? null : trx.triggerThen(name)
          .then(() => {
            this._graphTransaction = null;
            return method.apply(this, arguments);
          });
        };
      });

      trx.triggerThen = function(names, ...args) {
        names = eventNames(names);
        const flatMap = _.flow(_.map, _.flatten);
        const listeners = flatMap(names, _.bind(this.listeners, this));

        return Promise.map(listeners, (listener) => {
          return listener.apply(this, args);
        });
      };

      trx.getGraphTransaction = function() {
        return this._graphTransaction;
      };

      trx.setGraphTransaction = function(tx) {
        this._graphTransaction = tx;

        return this;
      };

      return cb(trx);
    });
  };
};
