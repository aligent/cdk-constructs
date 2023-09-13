'use strict';

const prerender = require('prerender');
const crypto = require('crypto');
const s3Cache = require('prerender-aws-s3-cache');

const server = prerender({
    chromeFlags: ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars', '--disable-dev-shm-usage'],
    forwardHeaders: true,
    chromeLocation: '/usr/bin/chromium-browser'
});

server.use({
    requestReceived: (req, res, next) => {
        let auth = req.headers['x-prerender-token'];
        if (!auth) return res.send(401);

        // compare credentials in header to list of allowed credentials
        const tokenAllowList = process.env.TOKEN_LIST.toString().split(',');

        let authenticated = false;
        for (const token of tokenAllowList) {
            authenticated = auth === token;

            if (authenticated) break;
        }
        if (!authenticated) return res.send(401);

        return next();
    },
    // Append a custom header to indicate the response is from Prerender
    beforeSend: function(req, res, next) {
        res.setHeader('x-prerender-requestid', crypto.randomUUID());
        return next();
    }
});

server.use(prerender.blacklist());

if (process.env.ENABLE_CACHE_FOR_REDIRECTION){
    server.use(prerender.removeScriptTags());
    var he = require('he');
    var s3 = new (require('aws-sdk')).S3({params:{Bucket: process.env.S3_BUCKET_NAME}});
    server.use({
            requestReceived: function(req, res, next) {
                if(req.method !== 'GET' && req.method !== 'HEAD') {
                    console.log("skipping requestReceived from S3 Cache... ")
                    return next();
                }
    
                var key = req.prerender.url;
    
                if (process.env.S3_PREFIX_KEY) {
                    key = process.env.S3_PREFIX_KEY + '/' + key;
                }
    
                s3.getObject({
                        Key: key
                }, function (err, result) {
    
                    if (!err && result) {
                        console.log(result.Metadata);
                        console.log("Found cached object: " + key);
                        if (result.Metadata.location){
                            res.setHeader('Location', result.Metadata.location);
                        }
                        return res.send(result.Metadata.httpreturncode, result.Body);
                    } else {
                        console.error(err);
                    }
    
                    next();
                });
            },
    
            pageLoaded: function(req, res, next) {
                const statusCodesToCache = ['200', '301', '302'];
                let metaTagStatusCode = 200;
                let location = '';
    
                if (req.prerender.content && req.prerender.renderType == 'html') {
                    let statusMatch = /<meta[^<>]*(?:name=['"]prerender-status-code['"][^<>]*content=['"]([0-9]{3})['"]|content=['"]([0-9]{3})['"][^<>]*name=['"]prerender-status-code['"])[^<>]*>/i,
                    headerMatch = /<meta[^<>]*(?:name=['"]prerender-header['"][^<>]*content=['"]([^'"]*?): ?([^'"]*?)['"]|content=['"]([^'"]*?): ?([^'"]*?)['"][^<>]*name=['"]prerender-header['"])[^<>]*>/gi,
                    head = req.prerender.content.toString().split('</head>', 1).pop(),
                    // statusCode = 200,
                    match;
    
                    if (match = statusMatch.exec(head)) {
                        metaTagStatusCode = match[1] || match[2];
                        req.prerender.content = req.prerender.content.toString().replace(match[0], '');
                        console.log("metaTagStatusCode: " + metaTagStatusCode);
                    }
    
                    while (match = headerMatch.exec(head)) {
                        location = he.decode(match[2] || match[4]);
                        res.setHeader(match[1] || match[3], location);
                        req.prerender.content = req.prerender.content.toString().replace(match[0], '');
                    }
    
                    // Skip caching for the http response codes not in the list, such as 404
                    if ( ! statusCodesToCache.includes(metaTagStatusCode.toString()) ) {
                        console.log("metaTagStatusCode " + metaTagStatusCode + " is not in the cachable code list. Returning without caching.");
                        return res.send(metaTagStatusCode, req.prerender.content);
                    }
                }
    
                if(req.prerender.statusCode !== 200) {
                    return next();
                }
    
                // Override req.prerender.statusCode with the StatusCode returned via the meta tag.
                // If metaTagStatusCode is not in the statusCodesToCache array or req.prerender.statusCode is not 200, then this line wouldn't be reached. Therefore no if condition for this overriding is needed.
                req.prerender.statusCode = metaTagStatusCode;
                console.log("Caching the object with statusCode " + req.prerender.statusCode);
    
                var key = req.prerender.url;
                var s3Metadata = {
                    httpreturncode: req.prerender.statusCode.toString()
                }
    
                if (location) {
                    s3Metadata.location = location;
                }
    
                if (process.env.S3_PREFIX_KEY) {
                    key = process.env.S3_PREFIX_KEY + '/' + key;
                }
    
                s3.putObject({
                    Key: key,
                    ContentType: 'text/html;charset=UTF-8',
                    StorageClass: 'REDUCED_REDUNDANCY',
                    Body: req.prerender.content,
                    Metadata: s3Metadata
                }, function(err, result) {
                    console.log(result);
                    if (err) console.error(err);
    
                    next();
                });
        }
    });
} else {
    server.use(prerender.httpHeaders());
    server.use(prerender.removeScriptTags());
    server.use(s3Cache);
}

server.start();
