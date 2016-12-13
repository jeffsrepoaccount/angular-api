/**
 * angular-auth AngularJS service
 *
 * @author Jeff Lambert 
 * @license MIT
 */
// WIP
(function() {
    'use strict';

    var serviceId = 'auth',
        app = angular.module('angular-auth', [
            'angular-utils',
            'angular-config'
        ])
    ;

    app.service(serviceId, [
        '$http', '$location', '$q', '$timeout', 
        'cache', 'common', 'angular.config', 'localStorage',
        function (
            $http, $location, $q, $timeout, 
            cache, common, config, localStorage
        ) {
            // Define what functions are publicly available for this service
            var svc = {
                hasUser:            hasUser,
                login:              login,
                logout:             logout,
                registerIdentity:   registerIdentity,
                renewToken:         renewToken,
                user:               user
            };

            // Capture references to log functions
            var logInfo     = common.getLogFn(serviceId, 'info'),
                logError    = common.getLogFn(serviceId, 'error'),
                logWarn     = common.getLogFn(serviceId, 'warn')
            ;

            var tokenRenewTimeout, sessionStart;

            return svc;

            /**
             * @return bool True if a user is currently authenticated, false otherwise
             */
            function hasUser() {
                var identity = user();

                return identity && identity.user_id;
            }

            /**
             * @param string username
             * @param string password
             * @return promise
             */
            function login(username, password) {
                if(!username || !password) {
                    logError('Username and password are required to login');
                    var defer = $q.defer();
                    defer.reject({data:{}});
                    return defer.promise;
                }
                return $http({
                    method: 'POST',
                    url: config.auth.provider + config.auth.login_uri,
                    data: { 
                        username: username, 
                        password: password,
                        grant_type: 'password',
                        client_id: config.client.id,
                        client_secret: config.client.secret
                    }
                }).then(function(data) {
                    sessionStart = Date.now();
                    return data;
                });
            }

            /**
             * @return promise - auto resolved, mainly for symmetry with login()
             */
            function logout() {
                var identity = user();
                cache.clear();

                localStorage.clear('identity');
                $location.path('/login');
                logInfo('Session Closed');
                if(tokenRenewTimeout) {
                    $timeout.cancel(tokenRenewTimeout);
                    tokenRenewTimeout = null;
                }

                if(identity.access_token) {
                    return $http({
                        method: 'POST',
                        url: config.auth.provider + config.auth.logout_uri,
                        headers: {
                            'Authorization': 'Bearer ' + identity.access_token
                        }
                    });
                }

                sessionStart = null;
                return $q.defer().resolve();
            }

            /**
             * @param identity - Identity to register
             */
            function registerIdentity(identity) {
                identity.createdAt = parseInt(new Date().getTime() / 1000);
                localStorage.setObject('identity', identity);

                // Set timer to renew access token a few moments prior 
                // to when it is set to expire.
                var renewTime =  (identity.expires_in * 0.9) * 1000;

                if(Date.now() + renewTime - sessionStart < (config.auth.max_session_ttl * 1000)) {
                    tokenRenewTimeout = $timeout(function() {
                        renewToken();
                    }, renewTime);
                } else {
                    logWarn('Authenticated session expiring soon');
                }
            }

            /**
             * Renew access token
             */
            function renewToken() {
                var identity = user();

                if(!identity || !identity.refresh_token) {
                    logInfo('Refresh token not available, please authenticate', null, true);
                    logout();
                    return;
                }

                return $http({
                    method: 'POST',
                    url: config.auth.provider + config.auth.login_uri,
                    data: { 
                        grant_type: 'refresh_token',
                        client_id: config.client.id,
                        client_secret: config.client.secret,
                        refresh_token: identity.refresh_token
                    }
                }).then(
                    function(data) {
                        logInfo('Access Token Renewed', data.data, true);
                        registerIdentity(data.data);
                    }, function() {
                        logWarn('Access renewal failed, please authenticate');
                        logout();
                    }
                );
            }

            /**
             * Retrieve current authenticated identity
             *
             * @return Object | null
             */
            function user() {
                var user = localStorage.getObject('identity');

                if(user.createdAt + user.expires_in < parseInt(new Date().getTime() / 1000)) { 
                    return null;
                }

                return user;
            }
        }
    ]);
})();
