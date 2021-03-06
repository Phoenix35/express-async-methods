/* eslint-env mocha */

"use strict";

const assert = require("node:assert/strict");
const express = require("express");
const superagent = require("superagent");
const { addAsync, wrap, Router } = require("../");

describe("Router", () => {
  it("creates a new async-friendly router", async () => {
    const app = express();

    const router = Router();

    router.getAsync("/foo", async (req, res, next) => {
      throw new Error("Oops!");
    });

    app.use(router);
    app.use((err, req, res, next) => {
      res.status(500).send(err.message);
    });

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000/foo")
      .catch(err => err);

    assert.ok(res instanceof Error);
    assert.strictEqual(res.response.text, "Oops!");

    await server.close();
  });
});

describe("addAsync", () => {
  it("works", async () => {
    const app = addAsync(express());

    app.useAsync(async (req, res, next) => {
      throw new Error("Oops!");
    });

    app.use((error, req, res, next) => {
      res.send(error.message);
    });

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000");

    assert.strictEqual(res.text, "Oops!");

    await server.close();
  });

  it("handles middleware in getter", async () => {
    const app = addAsync(express());

    const m = async function () {
      throw new Error("Oops!");
    };

    app.getAsync("*", m, async (req, res, next) => {
      throw new Error("Unexpected");
    });

    app.use((error, req, res, next) => {
      res.send(error.message);
    });

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000");

    assert.strictEqual(res.text, "Oops!");

    await server.close();
  });


  it("should work with mixed async and non-async handlers", async () => {
    const app = addAsync(express());

    app.getAsync("/", (req, res, next) => {
      req.helloMessage = "Hello, World!";
      next();
    }, async function routeHandler (req, res) {
      await new Promise(resolve => setTimeout(resolve, 10));
      res.send(req.helloMessage);
    });

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000");

    assert.strictEqual(res.text, "Hello, World!");

    await server.close();
  });

  it("should work with mixed async and non-async handlers, when throwing errors", async () => {
    const app = addAsync(express());

    app.getAsync("/", (req, res, next) => {
      throw new Error("Oops!");
    }, async function routeHandler (req, res) {
      await new Promise(resolve => setTimeout(resolve, 10));
      res.send(req.helloMessage);
    });

    app.useAsync(async (err, req, res, next) => {
      res.send(err.message);
    });

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000");

    assert.strictEqual(res.text, "Oops!");

    await server.close();
  });

  it("should be consistent with normal express routes", async () => {
    const app = addAsync(express());

    app.get("/normal", (req, res, next) => {
      req.testMessage = "1";
      next();
    }, (req, res, next) => {
      req.testMessage += "2";
      next();
    }, (req, res, next) => {
      setTimeout(() => {
        req.testMessage += "3";
        next();
      }, 10);
    }, async function routeHandler (req, res) {
      await new Promise(resolve => setTimeout(resolve, 10));
      res.send(req.testMessage);
    });

    app.getAsync("/async", (req, res, next) => {
      req.testMessage = "1";
      next();
    }, (req, res, next) => new Promise(resolve => {
      req.testMessage += "2";
      resolve();
    }), (req, res, next) => {
      setTimeout(() => {
        req.testMessage += "3";
        next();
      }, 10);
    }, async function routeHandler (req, res) {
      await new Promise(resolve => setTimeout(resolve, 10));
      res.send(req.testMessage);
    });

    const server = await app.listen(3000);

    const resNormal = await superagent.get("http://localhost:3000/normal");
    const resAsync = await superagent.get("http://localhost:3000/async");

    await server.close();

    assert.strictEqual(resNormal.text, "123");
    assert.strictEqual(resAsync.text, "123");
  });
});

describe("wrap", () => {
  it("works", async () => {
    const app = express();

    app.use(wrap(async (req, res, next) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      next();
    }));

    app.get("/", wrap(async (req, res) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      res.send("Hello, World!");
    }));

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000");

    assert.strictEqual(res.text, "Hello, World!");

    await server.close();
  });

  it("errors in middleware", async () => {
    const app = express();

    app.use(wrap(async function middleware (req, res, next) {
      throw new Error("Oops!");
    }));

    app.get("/", wrap(async function routeHandler (req, res) {
      await new Promise(resolve => setTimeout(resolve, 10));
      res.send("Hello, World!");
    }));

    app.use(function errorHandler (error, req, res, next) {
      res.send(error.message);
    });

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000");

    assert.strictEqual(res.text, "Oops!");

    await server.close();
  });

  it("async error handlers", async () => {
    const app = express();

    app.use(wrap(async (req, res, next) => {
      throw new Error("Oops!");
    }));

    app.get("/", wrap(async (req, res) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      res.send("Hello, World!");
    }));

    app.use(wrap(async (error, req, res, next) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      next(new Error(`New: ${error.message}`));
    }));

    app.use(wrap(async (error, req, res, next) => {
      res.send(error.message);
    }));

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000");

    assert.strictEqual(res.text, "New: Oops!");

    await server.close();
  });

  it("early exit", async () => {
    const app = express();
    let ran = false;

    app.use(wrap(async (req, res) => {
      res.send("Hello!");
    }));

    app.get("/", wrap(async (req, res) => {
      ran = true;
      res.send("Hello, World!");
    }));

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000");

    assert.strictEqual(res.text, "Hello!");
    assert.ok(!ran);

    await server.close();
  });

  it("supports chaining with route() (gh-9)", async () => {
    const app = express();
    const router = addAsync(express.Router());

    let ran = false;

    router.routeAsync("/foo").getAsync(async (req, res) => {
      ran = true;
      res.send("Hello, World");
    });

    app.use(router);

    const server = await app.listen(3000);

    const res = await superagent.get("http://localhost:3000/foo");

    assert.strictEqual(res.text, "Hello, World");
    assert.ok(ran);

    await server.close();
  });
});
