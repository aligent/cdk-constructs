/**
 * This file defines a Prerender server that uses AWS S3 cache to cache prerendered pages.
 * It also includes middleware to handle authentication, append a custom header to indicate the response is from Prerender,
 * and remove script tags from the prerendered content.
 * @requires prerender
 * @requires crypto
 * @requires prerender-aws-s3-cache
 * @requires he
 * @requires aws-sdk
 * @requires fs
 */
'use strict';

const prerender = require('prerender');
const crypto = require('crypto');
const s3Cache = require('prerender-aws-s3-cache');

const server = prerender({
    chromeFlags: ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars', '--disable-dev-shm-usage'],
    forwardHeaders: true,
    chromeLocation: '/usr/bin/chromium-browser'
});

const tokenJson = JSON.parse(process.env.TOKEN_SECRET);
const tokens = Object.keys(tokenJson);

const tokenAllowList = tokens.toString().split(',');

server.use({
    requestReceived: (req, res, next) => {
        // Log "x-prerender-user-agent" value forwarded from CloudFront/Lambda@edge that contains the original User-Agent value. If not present, e.g. requests from ELB, default to "user-agent" value.
        const userAgent = req.get('x-prerender-user-agent') || req.get('user-agent');

        console.log(`${new Date().toISOString()} User-Agent: "${userAgent}" ${req.prerender.reqId} ${req.prerender.url}`);
        let auth = req.headers['x-prerender-token'];
        if (!auth) {
            console.log(`${new Date().toISOString()} "${userAgent}" ${req.prerender.reqId} Authentication header not found.`);
            return res.send(401);
        }

        // compare credentials in header to list of allowed credentials and corresponding domains
        let authenticated = false;
        for (const token of tokenAllowList) {
            let domains = tokenJson[token].split(',')
            for (const domain of domains) {
                authenticated = (auth === token && req.url.startsWith(`/${domain}`) );
                if (authenticated) break;
            }
            if (authenticated) break;
        }
        if (!authenticated) {
            console.log(`${new Date().toISOString()} "${userAgent}" ${req.prerender.reqId} Authentication Failed.`);
            return res.send(401);
        }

        return next();
    },
    // Append a custom header to indicate the response is from Prerender
    beforeSend: function(req, res, next) {
        res.setHeader('x-prerender-requestid', crypto.randomUUID());
        return next();
    }
});

server.use(prerender.blacklist());

if (process.env.ENABLE_REDIRECT_CACHE.toLowerCase() === 'true'){
    var he = require('he');
    var s3 = new (require('aws-sdk')).S3({params:{Bucket: process.env.S3_BUCKET_NAME}});
    server.use({
            // The requestReceived and pageLoaded functions are a modified version of
            // httpHeader plugin - https://github.com/prerender/prerender/blob/478fa6d0a5196ea29c88c69e64e72eb5507b6d2c/lib/plugins/httpHeaders.js combined with
            // s3cache plugin - https://github.com/prerender/prerender-aws-s3-cache/blob/98707fa0f787de83aa41583682cd2c2d330a9cca/index.js
        requestReceived: function(req, res, next) {
                if(req.method !== 'GET' && req.method !== 'HEAD') {
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
                        console.log(`Found cached object: ${key}`);
                        if (result.Metadata.location){
                            res.setHeader('Location', result.Metadata.location);
                        }
                        // default 200 for legacy objects that do not have Metadata.httpreturncode defined
                        req.prerender.statusCode = result.Metadata.httpreturncode || 200
                    } else {
                        console.error(err);
                    }

                    next();
                });
            }});
    server.use(prerender.removeScriptTags());
    server.use({
        pageLoaded: function(req, res, next) {
            const statusCodesToCache = ['200', '301', '302'];
            var s3Metadata = {}

            // Inspect prerender meta tags and update response accordingly
            if (req.prerender.content && req.prerender.renderType == 'html') {
                const statusMatchRegex = /<meta[^<>]*(?:name=['"]prerender-status-code['"][^<>]*content=['"]([0-9]{3})['"]|content=['"]([0-9]{3})['"][^<>]*name=['"]prerender-status-code['"])[^<>]*>/i;
                const headerMatchRegex = /<meta[^<>]*(?:name=['"]prerender-header['"][^<>]*content=['"]([^'"]*?): ?([^'"]*?)['"]|content=['"]([^'"]*?): ?([^'"]*?)['"][^<>]*name=['"]prerender-header['"])[^<>]*>/gi
                const head = req.prerender.content.toString().split('</head>', 1).pop()

                const statusMatch = statusMatchRegex.exec(head)
                if (statusMatch) {
                    req.prerender.statusCode = statusMatch[1] || statusMatch[2];
                    req.prerender.content = req.prerender.content.toString().replace(statusMatch[0], '');
                }

                let headerMatch = headerMatchRegex.exec(head)
                while (headerMatch) {
                    s3Metadata.location = he.decode(headerMatch[2] || headerMatch[4]);
                    res.setHeader(headerMatch[1] || headerMatch[3], s3Metadata.location);
                    req.prerender.content = req.prerender.content.toString().replace(headerMatch[0], '');
                    headerMatch = headerMatchRegex.exec(head)
                }

                // Skip caching for the http response codes not in the list, such as 404
                if ( ! statusCodesToCache.includes(req.prerender.statusCode.toString()) ) {
                    console.log(`StatusCode ${req.prerender.statusCode} for ${req.prerender.url} is not in the cachable code list. Returning without caching the result.`);
                    return res.send(req.prerender.statusCode, req.prerender.content);
                }
            }
            s3Metadata.httpreturncode = req.prerender.statusCode.toString()

            console.log(`Caching the object ${req.prerender.url} with statusCode ${req.prerender.statusCode}`);
            var key = req.prerender.url;

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
