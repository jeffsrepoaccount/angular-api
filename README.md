# angular-api-client

This is an AngularJS API Client that provides client-side caching services.

## Dependencies

This project depends on [`angular-utils`](https://github.com/jeffsrepoaccount/angular-utils).  It also depends on an `angular-config` module existing, which should be provided by consumers.  It is a configuration module used solely for storing static environment data, and is separated out in this way so that multiple environments can be easily supported.  This is accomplished by defining a `angular-config` module within an implementing project that contains a single constant, `angular.config`.  It should look something like this:

```javascript
(function() {
    'use strict';

    var module = angular.module('angular-config', []);

    module.constant('angular.config', {
        app: {
            debug:              true,
            caching_enabled:    true,
            cache_ttl:          60,
            gc_timeout:         15
        }
        api: {
            provider:   'http://my.api.com/api',
            version:    'v1',
        }
    });
})();

```

## Installation

Install via bower by adding the following to the `dependencies` key in `bower.json`:

```javascript
dependencies: {
    // ...
    "angular-api-client": "https://github.com/jeffsrepoaccount/angular-api-client.git",
    // ...
}
```

```bash
$ bower update
```

You can also use NPM to install:

```bash
$ npm install jeffsrepoaccount/angular-api-client --save
```

## Usage

```html
<!-- Configuration -->
<script type="text/javascript" src="/js/config/angular-config.js"></script>
<!-- Utilities -->
<script type="text/javascript" src="/bower_components/angular-utils/dist/angular-utils.min.js"></script>
<!-- API Client -->
<script type="text/javascript" src="/bower_components/angular-api/dist/angular-api-client.min.js"></script>
```


```javascript
angular.module('my-module', ['angular-api-client'])
    .controller('MyCtrl', [
        'api',
        function(api) {
            // Build request.  This request will hit the '/resource?number=42&cursor=MTc=' endpoint
            var request = { endpoint: 'resource', params: { cursor: 'MTc=', number: 42 } };

            api.get(request).then(
                function(data) {
                    console.log('data', data.data);
                    console.log('meta', data.meta);
                }
            );
        }
    ])
;
```

## Endpoints

The endpoints constructed depend on the values supplied in `angular-config.api`. `version` is currently assumed to exist as part of the url. For example, if I wish to request data from an `items` endpoint, with `angular-config.api.provider = 'server.com/'` and `angular-config.api.version = 'v2.3'`, the following will be used as the URL endpoint:

    'server.com/v2.3/items'

`params` get appended as URL parameters, so using the previous example configuration data with the above example request, the following will be the ultimate URL being requested:

    `'server.com/v2.3/resource?cursor=MTc=&number=42'`

API application prefixing can be accomplished by simply postfixing it to the provider value, e.g. `angular-config.api.provider = 'https://server.com/api/'` will result in the following resource endpoints being used:

    `'https://servier.com/api/v2.3/resource'`

## Caching

Requests are cached in local storage. For more information about the structure of the cache, see [here](http://www.jeffreylambert.net/demos/chat/api).

## Garbage Collection

Since there's a cache, there's got to be garbage collection because fresher data is better data. It's behavior can be disabled entirely and controlled via values seen above in `angular-config.app`.  `cache_ttl` defines how long a record in the cache is considered valid, and `gc_timeout` controls how often the garbage collector will run. A `time` value is appended to each record in the cache, and anything older than `gc_timeout` will be removed, as well as any page in the cache that record is stored in.

## License

This package is released under the [MIT License](https://opensource.org/licenses/MIT).  For full details refer to LICENSE
