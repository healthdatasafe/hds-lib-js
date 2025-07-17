/* eslint-env mocha */
const { assert } = require('./test-utils/deps-node');

const { HDSLibError } = require('../src/errors');

describe('[ERRX] HDSLibError', () => {
  it('[ERRS] HDSLibError.toString() without inner message', async () => {
    const error = new HDSLibError('Hello');
    assert.equal(error.message, 'Hello');
    assert.equal('' + error, 'Error: Hello\nInner Object:\n{}');
  });

  it('[ERRM] HDSLibError.toString() with inner message', async () => {
    const innerObject = { message: 'Bob', dummy: 'Dummy' };
    const error = new HDSLibError('Hello', innerObject);
    assert.equal(error.message, 'Hello >> Bob');
    assert.equal('' + error, 'Error: Hello >> Bob\nInner Object:\n{\n  "message": "Bob",\n  "dummy": "Dummy"\n}');
    assert.deepEqual(error.innerObject, innerObject);
  });

  it('[ERRO] HDSLibError.toString() with bject without message', async () => {
    const error = new HDSLibError('Hello', { dummy: 'Dummy' });
    assert.equal(error.message, 'Hello');
    assert.equal('' + error, 'Error: Hello\nInner Object:\n{\n  "dummy": "Dummy"\n}');
  });
});
