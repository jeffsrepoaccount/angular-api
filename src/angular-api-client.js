/**
 * angular-api AngularJS service
 *
 * @author Jeff Lambert 
 * @license MIT
 */
(function() {
    'use strict';

    var app = angular.module('angular-api-client', [
        'angular-utils',
        'angular-config',
        'angular-cache',
        'angular-auth',
        'base64'
    ]);

    app.service('api', [
        '$http', '$interval', '$location', '$q', '$rootScope', '$timeout', '$window',
        'auth', 'cache', 'common', 'angular.config', 'localStorage',
        function(
            $http, $interval, $location, $q, $rootScope, $timeout, $window, 
            auth, cache, common, config, localStorage
        ) {
            // Define what functions are publicly available for this service
            var svc = {
                get:        get,
                post:       post,
                clearCache: clearCache,
                gc:         gc
            };

            // Capture references to log functions
            var logSuccess  = common.getLogFn('api', 'success'),
                logInfo     = common.getLogFn('api', 'info'),
                logWarn     = common.getLogFn('api', 'warn'),
                logError    = common.getLogFn('api', 'error')
            ;

            startCollectingGarbage();

            return svc;

/** Public functions **/
            /**
             * Performs HTTP GET
             * @param opts - Request options
             */
            function get(opts) {
                // Request options structure:
                //  { 
                //      endpoint: 'resource', 
                //      params: { 
                //          cursor: 'MTc=', 
                //          number: 42 
                //      } 
                //  }
                var promise = $q.defer();
                // Build a request to send to $http
                var req = {
                        method: 'get',
                        url: buildUrl(opts),
                        headers: buildHeaders(auth.user())
                    },
                // Check if there's a cache hit if enabled
                    cacheHit = config.app.caching_enabled ? 
                        cache.lookup(req, opts) : null
                ;

                if(cacheHit) {
                    // Bail
                    promise.resolve(cacheHit);
                    logInfo('Resolved data from cache', cacheHit, true);
                    return promise.promise;
                }

                // Not in cache, reach out to server
                send(req).then(function(data) {

                    // Validate structure of response returned
                    // If there's meta data, there should be a cursor value included
                    if(!data.data || (data.meta && !data.meta.cursor)) {
                        logError('Invalid API Response Format', data, true);
                        promise.reject(data.data);
                    } else {
                        logInfo('Resolved data from server', data.data.data, true);
                        // Go ahead and resolve promise first so anything waiting on it 
                        // can continue.
                        if(!data.data.meta) {
                            promise.resolve(data.data.data);    
                        } else {
                            promise.resolve(data.data);
                        }
                        
                        if(config.app.caching_enabled && 
                            // Don't cache empty responses
                            ((data.meta && data.data.data.length) || data.data.data)
                        ) {
                            // Cache data
                            cache.insert(data.data, req, opts);
                        }
                    }

                    return data.data;
                }, function(data) {
                    resolveError(data, promise);
                });

                return promise.promise;
            }

            /**
             * Perform HTTP POST
             */
            function post(opts) {
                // Request options structure:
                //  { 
                //      endpoint: 'resource/{id}', 
                //      params: { 
                //          data: {
                //              resource_attribute: "value"
                //          }
                //      } 
                //  }
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

            /**
             * Clears endpoint cache
             *
             * @param string endpoint
             */
            function clearCache(endpoint) {
                cache.clear(endpoint);
            }

            /**
             * Runs cache garbage collection routine
             */
            function gc() {
                cache.gc();
            }

/** Private functions **/
            /**
             * Startup garbage collection interval if configured
             */
            function startCollectingGarbage() {
                if(config.app.caching_enabled && config.app.gc_timeout) {
                    // Set up garbage collection
                    $interval(function() {
                        cache.gc();
                    }, config.app.gc_timeout * 1000);
                }
            }

            /**
             * Sends an HTTP request
             *
             * @param Object req - passed through to angular $http
             * @return promise
             */
            function send(req) {
                return $http(req);
            }

            /**
             * Constructs $http header object.
             *
             * @param Object user If user provided has an access_token, add 
             *  bearer token to the request headers
             * @return Object headers to send to $http
             */
            function buildHeaders(user) {
                var headers = {
                    'Accept':       'application/json',
                    'Content-Type': 'application/json'
                };

                if(user && user.access_token) {
                    headers['Authorization'] = 'Bearer ' + user.access_token;
                }

                return headers;
            }

            /**
             * @param Object opts - Request options object
             * @return string URL request is trying to reach
             *
             * TODO: Move version to headers?
             */
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

            /**
             * Determines an appropriate message to send to the console
             *
             * @param data - As returned from API
             * @param promise - Current promise that needs to be rejected
             */
            function resolveError(data, promise) {
                switch(data.status) {
                    case 400:
                        // API thinks this client made a mistake
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
                        logWarn('Slow Down! API is rate limiting', data.data);
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
