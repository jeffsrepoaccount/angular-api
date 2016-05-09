(function() {
    'use strict';

    var app = angular.module('jrl-cache', [
        'jrl.utils',
        'jrl.config'
    ]);

    app.service('cache', [
        '$base64', 'common', 'jrl.config', 'localStorage',
        function($base64, common, config, localStorage) {
            var svc = {
                clear: clear,
                gc: evictOldEntries,
                insert: insert,
                lookup: lookup
            };

            var logInfo = common.getLogFn('cache', 'info'),
                logWarn = common.getLogFn('cache', 'warn');

            var implementedFilters = ['cursor', 'include', 'number'];

            return svc;

            function clear(key) {
                if(key) {
                    localStorage.clear(key);
                } else {
                    localStorage.keys().forEach(function(endpoint) {
                        if(endpoint !== 'identity') {
                            localStorage.clear(endpoint);
                        }
                    });
                }

                logInfo('Cache Cleared', key, true);
            }

            function evictOldEntries() {
                if(config.app.debug) {
                    logInfo('Collecting Garbage', localStorage.space(), true);
                }

                localStorage.keys().forEach(function(endpoint) {
                    if(endpoint === 'identity') {
                        return;
                    }

                    var cache = localStorage.getObject(endpoint),
                        removeIds = [],
                        finallyRemoved = [];
                    
                    if(!cache.pages) {
                        return;
                    }
                    
                    Object.keys(cache).forEach(function(key) {
                        // Identify invidiual entries that are too old
                        if(key !== 'pages' && cacheAge(cache[key]) >= config.app.cache_ttl) {
                            removeIds.push(key);
                        }
                    });

                    // Identify pages that contain ids that should be evicted
                    // If a page contains an expired item, evict the entire page
                    Object.keys(cache.pages).forEach(function(key) {
                        if( // The cursor for the first page is not known until
                            // the server responds. Page '0' is a string 
                            // containing the index of the first page.
                            '0' !== key && 
                            cache.pages[key].data.intersect(removeIds).length
                        ) {
                            
                            // If this page is the first page, remove lookup
                            if(key === cache.pages[0]) {
                                delete cache.pages[0];
                            }

                            // Evict page
                            cache.pages[key].data.forEach(function(id) {
                                delete cache[id];
                                finallyRemoved.push(id);
                            });
                            delete cache.pages[key];
                        }
                    });

                    if(finallyRemoved.length) {
                        logInfo('Garbage Collected ' + finallyRemoved.length + ' ' + endpoint, finallyRemoved, true);
                    }

                    try {
                        localStorage.setObject(endpoint, cache);
                    } catch(e) {
                        quotaExceededError(endpoint, cache);
                    }
                });
            }

            function insert(data, request, opts) {
                // Do not store in cache if the options contain unimplemented 
                // filters.
                // TODO: Entities can still be cached individually, just 
                // ignore any meta data if unimplemented filters used
                if(opts && opts.params && hasUnimplementedFilters(Object.keys(opts.params))) {
                    return null;
                }

                var curRequest = cacheRequest(request),
                    cacheKey = curRequest.endpoint,
                    cache = localStorage.getObject(cacheKey)
                ;

                if(common.isEmptyObject(cache)) {
                    cache = { pages: {}};
                }

                if(data.meta) {
                    // collection result - cache each individual entity and 
                    // store list of ids and meta reference in lookup
                    var page = [],
                        cursor = data.meta.cursor.current;
                    data.data.forEach(function(entity) {
                        page.push(entity.id);
                        entity = {
                            data: entity,
                            time: parseInt(new Date().getTime() / 1000)
                        };

                        cache[entity.data.id] = entity;
                    });

                    page = {
                        data: page,
                        meta: data.meta
                    };

                    if(!cursor && data.data.length) {
                        // If the first page, calculate what the actual cursor 
                        // should be and store a redirect to it for page 0
                        var firstPageCursor = encodeURIComponent(
                            $base64.encode(data.data[0].created_at)
                        );
                        cache.pages[0] = firstPageCursor;
                        cursor = firstPageCursor;
                    }

                    cache.pages[cursor] = page;
                    logInfo('Page Cached', page, true);
                } else {
                    // entity result
                    data.time = parseInt(new Date().getTime() / 1000);
                    cache[curRequest.id] = data;
                    logInfo('Entity cached', data, true);
                }

                try {
                    localStorage.setObject(cacheKey, cache);
                } catch(e) {
                    quotaExceededError(cacheKey, cache);
                }
            }

            function lookup(request, opts) {

                var curRequest = cacheRequest(request),
                    cacheKey = curRequest.endpoint,
                    cache = localStorage.getObject(cacheKey),
                    page = 0
                ;

                // If the request contains unimplemented filters,
                // indicate a cache miss
                if(opts && opts.params && hasUnimplementedFilters(Object.keys(opts.params))) {
                    return null;
                }

                if(!common.isEmptyObject(cache)) {
                    if(curRequest.id) {
                        if(cache[curRequest.id] && cacheAge(cache[curRequest.id]) < config.app.cache_ttl) {
                            var hasAllData = true;
                            // Ensure any embedded data is also available on the cached object.
                            // If not, the cache does not have enough data to fulfill the request.
                            if(opts.params && opts.params.include) {
                                opts.params.include.split(',').forEach(function(include) {
                                    hasAllData = hasAllData && checkInclude(include, cache[curRequest.id].data);
                                });
                            }

                            return hasAllData ? cache[curRequest.id].data : null;
                        }

                        return null;
                    } 

                    if(curRequest.query && curRequest.query.cursor) {
                        //page = encodeURIComponent(curRequest.query.cursor);
                        page = curRequest.query.cursor;
                    } 

                    if(cache.pages[page]) {
                        var out = [],
                            expired = false;

                        if(0 === page) {
                            page = cache.pages[page];
                        }

                        cache.pages[page].data.forEach(function(id) {
                            if(!id || (cache[id] && cacheAge(cache[id]) > config.app.cache_ttl)) {
                                expired = true;
                            } 

                            out.push(cache[id].data);
                        });

                        if(expired) {

                            return null;
                        }

                        return { data: out, meta: cache.pages[page].meta };
                    } 
                } 

                return null;
            }

            function checkInclude(include, data) {
                if(!include.trim()) {
                    return true;
                }

                var recursiveIncludes = include.split('.'),
                    curInclude = recursiveIncludes.shift()
                ;

                if(!data[curInclude]) {
                    return false;
                }

                return data[curInclude] && 
                    (recursiveIncludes.length ? 
                        checkInclude(recursiveIncludes.join('.'), data[curInclude]) :
                        true)
                ;
            }

            function cacheRequest(req) {
                var request = req.url.replace(
                        config.api.provider + '/' + config.api.version + '/',
                        ''
                    ).split('?'),
                    endpoint = request[0].split('/'),
                    query = request[1] ? common.queryStringToJson(request[1]) : {},
                    out = { endpoint: endpoint[0], query: query, id: null }
                ;

                if(endpoint.length > 1) {
                    out.id = endpoint[1];
                } 

                return out;
            }

            function cacheAge(cacheEntry) {
                var now = parseInt(new Date().getTime() / 1000);
                return now - cacheEntry.time;
            }

            function hasUnimplementedFilters(filters) {
                var i, s, len = filters.length;
                for (i=0; i<len; ++i) {
                  if (!implementedFilters.contains(filters[i])) {   
                    return true;
                  }
                }

                return false;
            }

            function quotaExceededError(key, value) {
                logWarn('Storage quota exceeded, flushing entity cache', key, true);
                localStorage.clear(key);
            }
        }
    ]);    
})();
