(function() {
    'use strict';

    var app = angular.module('jrl-api', [
        'jrl.utils',
        'jrl.config',
        'jrl-cache',
        'jrl-auth',
        'base64'
    ]);

    app.service('api', [
        '$http', '$interval', '$location', '$q', '$rootScope', '$timeout', '$window',
        'auth', 'cache', 'common', 'jrl.config', 'localStorage',
        function(
            $http, $interval, $location, $q, $rootScope, $timeout, $window, 
            auth, cache, common, config, localStorage
        ) {
            var svc = {
                get: get,
                post: post,
                clearCache: clearCache,
                gc: gc
            };

            var logSuccess = common.getLogFn('api', 'success'),
                logInfo = common.getLogFn('api', 'info'),
                logWarn = common.getLogFn('api', 'warn'),
                logError = common.getLogFn('api', 'error');

            if(config.app.caching_enabled && config.app.gc_timeout) {
                // Set up garbage collection
                $interval(function() {
                    cache.gc();
                }, config.app.gc_timeout * 1000);
            }

            return svc;

            function get(opts) {
                var promise = $q.defer();
                var req = {
                        method: 'get',
                        url: buildUrl(opts),
                        headers: buildHeaders(auth.user())
                    },
                    cacheHit = config.app.caching_enabled ? 
                        cache.lookup(req, opts) : null
                ;

                if(cacheHit) {
                    promise.resolve(cacheHit);
                    logInfo('Resolved data from cache', cacheHit, true);
                    return promise.promise;
                }

                send(req).then(function(data) {

                    // Validate structure of response returned
                    if(!data.data || (data.meta && !data.meta.cursor)) {
                        logError('Invalid API Response Format', data, true);
                        promise.reject(data.data);
                    } else {
                        logInfo('Resolved data from server', data.data.data, true);
                        if(!data.data.meta) {
                            promise.resolve(data.data.data);    
                        } else {
                            promise.resolve(data.data);
                        }
                        
                        if(config.app.caching_enabled && 
                            // Don't cache empty responses
                            ((data.meta && data.data.data.length) || data.data.data)
                        ) {
                            cache.insert(data.data, req, opts);
                        }
                    }

                    return data.data;
                }, function(data) {
                    resolveError(data, promise);
                });

                return promise.promise;
            }

            function post(opts) {
                var promise = $q.defer();
                var req = {
                    method: 'post',
                    url: buildUrl(opts),
                    headers: buildHeaders(auth.user())
                };

                if(opts.data) {
                    req.data = opts.data;
                }

                send(req).then(function(data) {
                    logSuccess('Data Resolved', data.data, true);
                    cache.insert(data.data, req);
                    promise.resolve(data.data);
                }, function(data) {
                    resolveError(data, promise);
                });

                return promise.promise;
            }

            function clearCache(endpoint) {
                cache.clear(endpoint);
            }

            function gc() {
                cache.gc();
            }

/**                                                                         **/
            function send(req) {
                return $http(req);
            }

            function buildHeaders(user) {
                var headers = {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                };

                if(user && user.access_token) {
                    headers['Authorization'] = 'Bearer ' + user.access_token;
                }

                return headers;
            }

            function buildUrl(opts) {
                var url = config.api.provider + '/' + config.api.version + '/' 
                    + opts.endpoint,
                    params = []
                ;
                if(opts.params) {
                    Object.keys(opts.params).forEach(function(key) {
                        params.push(encodeURIComponent(key) + '=' + encodeURIComponent(opts.params[key]));
                    });
                }

                return  url + (params.length ? '?' + params.join('&') : '');
            }

            function resolveError(data, promise) {
                switch(data.status) {
                    case 400:
                        // API thinks this client made a mistake?
                        logError('Client communication error', data.data);
                        rejectCurrent(promise);
                        break;
                    case 401:
                        rejectCurrent(promise);
                        logInfo('Authentication Required', data.data);
                        $rootScope.afterLoginUrl = $location.url();
                        auth.logout();
                        break;
                    case 403:
                        logWarn('Unauthorized', data.data);
                        rejectCurrent(promise);
                        break;
                    case 404:
                        logWarn('Resource Not Found', data.data);
                        rejectCurrent(promise);
                        break;
                    case 429:
                        common.toastWarning('Slow Down! API is rate limiting');
                        rejectCurrent(promise);
                        break;
                    case 0:         // FALL THROUGH
                    case 500:
                    default:
                        logError('Data Server Error', data.status);
                        rejectCurrent(promise);
                        break;
                }

                function rejectCurrent(promise) {
                    if(promise) {
                        promise.reject(data);
                    }
                }
            }
        }
    ]);
})();
