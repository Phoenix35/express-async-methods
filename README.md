# @phoenix35/express-async-methods

My own take at making `express` compatible with async functions.  
**Heavily** inspired by
[@awaitjs/express](<https://github.com/vkarpov15/awaitjs-express/>)
and [@root/async-router](<https://github.com/therootcompany/async-router>).

Most credits go to them.

# How to use

## addAsync
```
addAsync(
  app[, methods ]
);
```
The default methods that this adds support to
```js
methods = [ "use", "delete", "get", "head", "param", "patch", "post", "put" ]
```


If you don't use a router, wrap your express app with this.

```js
const express = require("express");
const { addAsync } = require("@phoenix35/express-async-methods");

const app = addAsync(express());

// Supports error-handling middleware
app.useAsync(async (err, req, res, next) => {
  await asyncLog(err.stack);

  res.status(500).send("Something broke!");
});

// Supports any routing
app.getAsync("/users/:userId", async (req, res) => {
  const userInfo = await dbFetch({ user: req.params.userId });

  res.json(userInfo);
});

```

## Router
```
Router(
  [[ options, ] methods ]
)
```
`options` is the [options](<https://expressjs.com/en/api.html#express.router>) object you would pass to the creation of the router instance  
See [addAsync](#addasync) for the default methods.


If you want to use a router, import the async-ready version.

```js
const express = require("express");
const { Router } = require("@phoenix35/express-async-methods");

const app = express(); // This app isn't async friendly.
const router = Router(); // But this router is.

router.getAsync("/i-am-error", async (req, res) => {
  await new Promise(resolve => {
    setTimeout(resolve, 100);
  });

  throw new Error("You summoned an error, you devil!");
});

app.use(router);

```

## wrap

If you want granular control, you can wrap individual callback functions.  
(NOT for `app.param`, see [below](#wrapparam)).

```js
const express = require("express");
const { wrap } = require("@phoenix35/express-async-methods");

const app = express();

app.put("/users/:userId", wrap(async (req, res) => {
  await dbUpdate({ user: req.params.userId, newInfo: req.body });

  res.sendStatus(204);
}));

// Regular methods can still be used without wrapping
app.get("/users/:userId", (req, res, next) => {
  dbFetch({ user: req.params.userId }, (err, userInfo) => {
    if (err)
      return next(err);

    res.json(userInfo);
  })
});

```

### wrapParam

Because of the specific signature of [`app.param`](<https://expressjs.com/en/api.html#app.param>), use `wrapParam` instead.

```js
const express = require("express");
const { wrap, wrapParam } = require("@phoenix35/express-async-methods");

const app = express();

app.param("userId", wrapParam(async (req, res, next, id) => {
  const userInfo = await dbFetch({ user: id });

  if (userInfo == null) {
    throw new TypeError("Failed to load user");
    // next will be called automatically
  }

  req.user = userInfo;
  // next will be called automatically
}));

app.put("/users/:userId", wrap(async (req, res) => {
  await dbUpdate({ user: req.user.id, newInfo: req.body });

  res.sendStatus(204);
}));

```

Note that `app.paramAsync` and `Router.paramAsync` are properly created and handled by default.
