import {
  v1 as neoDriver
} from 'neo4j-driver';

import Promise from 'bluebird';
import _ from 'lodash';

const env = process.env;

const neo4j = neoDriver.driver(
  env.NEO4J_SERVER_BOLT,
  neoDriver.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
);

neo4j.getSession = function getSession() {
  return Promise.resolve(neo4j.session())
  .disposer((sess, promise) => {
    return sess.close();
  });
};

neo4j.run = function run(cypher) {
  return Promise.using(neo4j.getSession(), (session) => {
    return session.run(cypher)
    .catch(neo4j._convertError.bind(neo4j, cypher));
  });
};

neo4j.fetchAll = function fetchAll(cypher, options = {}) {
  return neo4j.run(cypher)
  .then((result) => {
    if (options.require && result.records.length === 0) {
      throw new Error('EmptyResponse');
    }

    return result.records;
  }).catch(neo4j._convertError.bind(neo4j, cypher));
};

neo4j.fetchOne = function fetchOne(cypher, options = {}) {
  return neo4j.run(cypher)
  .then((results) => {
    const record = results.records[0];

    if (! record && options.require) {
      throw new Error('EmptyResponse');
    }

    return record;
  }).catch(neo4j._convertError.bind(neo4j, cypher));
};

neo4j._convertError = function _convertError(cypher, err) {
  if (process.env.NEO4J_DEBUG) {
    console.log(cypher, err); // eslint-disable-line no-console
  }

  if (! (err instanceof Error)) {
    const fields = _.get(err, 'fields[0]', {});

    throw new Error(
      `${fields.code} (${err.signature}): ${fields.message}`,
    );
  } else {
    throw err;
  }
};

neo4j.transaction = function(cypher, options = {}) {
  const transaction = options.transacting;

  if (! transaction) {
    throw new Error('neo4j: Transactions must be passed a current transaction from bookshelf');
  }

  let tx = transaction.getGraphTransaction();

  if (! tx) {
    const session = neo4j.session();

    tx = session.beginTransaction();

    transaction.setGraphTransaction(tx);

    transaction.on('commit', () => {
      return tx.commit()
      .then((result) => {
        session.close();
      }).catch(neo4j._convertError.bind(neo4j, 'COMMIT'));
    });

    transaction.on('rollback', () => {
      return tx.rollback()
      .then(() => {
        session.close();
      }).catch(neo4j._convertError.bind(neo4j, 'ROLLBACK'));
    });
  }

  return tx.run(cypher)
  .then((result) => {
    const response = _.get(result, 'records[0]._fields[0].response', null);
    const error = _.get(result, 'records[0]._fields[0].error', ! response);
    const message = _.get(
      result,
      'records[0]._fields[0].message',
      'Procedure did not return a error message'
    );

    if (error) {
      throw new Error(message);
    }

    return response;
  })
  .catch((err) => {
    throw neo4j._convertError(cypher, err);
  });
};

neo4j.procedure = function procedure(cypher, options = {}) {
  if (_.toUpper(cypher).indexOf('RETURN {') === -1) {
    cypher += `
      RETURN {
        error: false
      };
    `;
  }

  return _.get(options, 'transacting', false) ? neo4j.transaction(cypher, options) :
  Promise.using(neo4j.getSession(), (session) => {
    const tx = session.beginTransaction();

    return tx.run(cypher)
    .then((result) => {
      const response = _.get(result, 'records[0]._fields[0].response', null);
      const error = _.get(result, 'records[0]._fields[0].error', ! response);
      const message = _.get(
        result,
        'records[0]._fields[0].message',
        'Procedure did not return a error message'
      );

      if (error) {
        tx.rollback();
        throw new Error(message);
      } else {
        tx.commit();
      }

      return response;
    })
    .catch((err) => {
      tx.rollback();

      throw neo4j._convertError(cypher, err);
    });
  });
};

neo4j.if = function cypherIf(condition, yes, no) {
  let out = '';

  if (yes) {
    out = `
    FOREACH (ignored IN CASE WHEN ${condition} THEN [1] ELSE [] END |
      ${yes.trim()}
    )
    `;
  }

  if (no) {
    out += `
    FOREACH (ignored IN CASE WHEN NOT ${condition} THEN [1] ELSE [] END |
      ${no.trim()}
    )
    `;
  }

  return out.trim();
};

export default neo4j;
