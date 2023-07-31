'use strict';

const prerender = require('prerender');
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
server.use(prerender.httpHeaders());
server.use(prerender.removeScriptTags());
server.use(s3Cache);

server.start();
