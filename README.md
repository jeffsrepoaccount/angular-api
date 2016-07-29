# jrl-api

This is an AngularJS API Client that provides client-side caching services.

## Dependencies

This project depends on `jrl.utils` (which is still currently in a private BitBucket repository).  It also depends on a `jrl.config` module existing, which should be provided by consumers.  It is a configuration module used solely for storing static environment data, and is separated out in this way so that multiple environments can be easily supported.  This is accomplished by defining a `jrl.config` module within an implementing project that contains a single constant, `jrl-config`.  It should look something like this:

```javascript
(function() {
    'use strict';

    var module = angular.module('jrl.config', []);

    module.constant('jrl.config', {
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
    "jrl-api": "https://github.com/jeffsrepoaccount/angular-api.git",
    // ...
}
```

```bash
$ bower update
```


## Usage

```html
<!-- Configuration -->
<script type="text/javascript" src="/js/config/jrl-config.js"></script>
<!-- Utilities -->
<script type="text/javascript" src="/bower_components/jrl-utils/dist/jrl.utils.min.js"></script>
<!-- API Client -->
<script type="text/javascript" src="/bower_components/jrl-api/dist/jrl-api.min.js"></script>
```


```javascript
angular.module('my-module', ['jrl-api'])
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

## License

This package is released under the [MIT License](https://opensource.org/licenses/MIT).  For full details refer to LICENSE
