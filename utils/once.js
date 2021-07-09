"use strict";

module.exports = function once (fn) {
  let called = false;

  /**
   * Wraps a function to only be executed once.
   *
   * @this {*} context
   */
  return function onceWrapped () {
    if (called)
      return;

    called = true;
    fn.apply(this, arguments);
  };
};
