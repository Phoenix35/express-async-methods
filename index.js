/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// No strict mode
// This is a fairly unusual case.
// We hijack `next` and make it only callable once in the handler.
// This is done via `arguments`
// No other trickery is involved, code is safe.

const once = require("./utils/once");
const { isPromise, isRegExp } = require("node:util/types");

const { map } = Array.prototype;

/**
 * Simple definition for an express "primitive" param passed to a method
 *
 * @typedef {string|RegExp|function(): (void|Promise<void>)} expressMethodArg
 */

/**
 * If given a `path`, returns it.
 * If given a callback (or an array thereof), wraps it (them)
 *
 * @param {expressMethodArg|expressMethodArg[]} arg - `path` or `callback`
 * @returns {expressMethodArg|expressMethodArg[]} - `path` or a wrapped `callback` to handle async
 * @private
 */
function _wrapArg (arg) {
  // Order from most to least likely in my opinion
  if (typeof arg === "string")
    return arg;

  if (typeof arg === "function")
    return wrap(arg);

  if (Array.isArray(arg))
    return arg.map(_wrapArg);

  if (isRegExp(arg))
    return arg;

  throw new TypeError(`An unexpected argument kind (${typeof arg}) has been given to the router. See <https://expressjs.com/en/api.html#app.METHOD>`);
}

/**
 * The actual async handling logic, applied for any method, `PARAM` or not
 *
 * @param {function(): Promise<void>} fn - The callback to pass to the method handler
 * @param {arguments} args - The arguments passed to the callback
 * @param {Response} res - The `express` `res` object
 * @param {Function} next - The `next` middleware function
 * @private
 */
async function _mainWrap (fn, args, res, next) {
  try {
    const promise = fn.apply(null, args);

    // A regular handler should have called `next` so we only take care of async handlers
    if (isPromise(promise)) {
      await promise;

      if (!res.headersSent)
        next(); // eslint-disable-line node/callback-return
    }
  } catch (err) {
    if (!res.headersSent)
      next(err); // eslint-disable-line node/callback-return
  }
}

/**
 * Given a function that returns a promise, converts it into something you
 * can safely pass into `app.use()`, `app.get()`, etc.
 *
 * @param {function(): Promise<void>} fn - The callback to pass to the method handler
 * @returns {(function(): Promise<void>)} - The wrapped callback with proper `next` handling
 */
function wrap (fn) {
  const isErrorHandler = fn.length === 4;

  const resIndex = 1 + isErrorHandler,
        nextIndex = 2 + isErrorHandler;

  function asyncWrapped () {
    // trickery
    // eslint-disable-next-line no-multi-assign, no-extra-parens
    const next = (arguments[nextIndex] = once(arguments[nextIndex]));

    _mainWrap(fn, arguments, arguments[resIndex], next);
  }

  Object.defineProperties(asyncWrapped, {
    length: {
      value: isErrorHandler
        ? 4
        : 3,
      configurable: true,
    },
    name: {
      value: isErrorHandler
        ? "wrappedErrorHandler"
        : "wrappedMiddleware",
      configurable: true,
    },
  });

  return asyncWrapped;
}

/**
 * Special case of `wrap` stemming from the unique signature of `app.param`
 * `app.param(name: string|string[], (req, res, next, paramValue[, paramName]) => {})`
 *
 * @param {Function} fn - The callback to pass to `app.param`
 * @returns {(function(): Promise<void>)} - The wrapped callback with proper `next` handling
 */
function wrapParam (fn) {
  function wrappedParamMiddleware () {
    // trickery
    // eslint-disable-next-line no-multi-assign, no-extra-parens
    const next = (arguments[2] = once(arguments[2]));

    _mainWrap(fn, arguments, arguments[1], next);
  }

  Object.defineProperty(wrappedParamMiddleware, "length", {
    value: 5,
    configurable: true,
  });

  return wrappedParamMiddleware;
}

/**
 * Augments `app` so express can handle async functions
 *
 * @param {object} app - The classic, non-extended, express `app`
 * @param {string[] | undefined} methods - The express methods you want to include
 * @returns {object} - The given `app`
 */
function addAsync (
  app,
  methods = [ "use", "delete", "get", "head", "param", "patch", "post", "put" ],
) {
  // Expose for tests
  app.routeAsync = function routeAsync () {
    return addAsync(this.route.apply(this, arguments));
  };

  // Special handling of `app.param`
  const paramIndex = methods.indexOf("param");

  if (paramIndex !== -1) {
    methods.splice(paramIndex, 1);

    /**
     * Extends `app` with a `paramAsync` METHOD
     *
     * @param {string} name - Same as for `app.param(name, callback)`
     * @param {Function} callback - An async function to be called by `app.param`
     * @returns {this} - `app`
     */
    app.paramAsync = function paramAsync (name, callback) {
      return app.param(name, wrapParam(callback));
    };
  }

  for (const method of methods) {
    /*
      Use Object.assign here to assign the function name. Useful in stack traces.
      The `obj[prop] = function ...` syntax fails to infer `prop` as the function's name.
     */
    Object.assign(app, {
      // eslint-disable-next-line lines-around-comment
      /**
       * Extends `app` with the current async METHOD handler
       *
       * @returns {this} - `app`
       */
      [`${method}Async`] () {
        const args = map.call(arguments, _wrapArg);

        return app[method](...args);
      },
    });
  }

  return app;
}

module.exports = {
  wrap,
  wrapParam,
  addAsync,

  /**
   * Returns an augmented `Router` that can handle async functions.
   * See `addAsync`
   *
   * @param {object|Array} optionsOrMethods - The array of methods to pass to `addAsync`. If an object,
   * then it is passed to the creation of the express router
   * and the second (unnamed) argument passed to `addAsync` as the methods array
   * @returns {object} - `Router`
   */
  Router: function asyncRouter (optionsOrMethods) { // eslint-disable-line func-name-matching
    const express = require("express");

    return Array.isArray(optionsOrMethods)
      ? addAsync(express.Router(), optionsOrMethods)
      : addAsync(express.Router(optionsOrMethods), arguments[1]);
  },
};
