'use strict';

const prerender = require('prerender');
const s3Cache = require('prerender-aws-s3-cache');

const server = prerender({
    chromeFlags: ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars', '--disable-dev-shm-usage'],
    forwardHeaders: true,
    chromeLocation: '/usr/bin/chromium-browser'
});

server.use(prerender.blacklist());
server.use(prerender.httpHeaders());
server.use(prerender.removeScriptTags());
server.use(s3Cache);

server.use({
    requestReceived: (req, res, next) => {
        let auth = req.headers.x-prerender-authorization;
        if (!auth) return res.send(401);

        // malformed
        let parts = auth.split(' ');
        if ('basic' != parts[0].toLowerCase()) return res.send(401);
        if (!parts[1]) return res.send(401);
        auth = parts[1];

        // credentials
        auth = new Buffer.from(auth, 'base64').toString();
        auth = auth.match(/^([^:]+):(.+)$/);
        if (!auth) return res.send(401);

        // compare credentials in header to list of allowed credentials
        let basicAuthAllowList = [];

        const basicAuthEnvList = process.env.BASIC_AUTH.toString().split(',');

        for (const [index, element] of basicAuthEnvList.entries()) {
            const authIndex = (index - index % 2) / 2
            if (index % 2 === 0) {
                basicAuthAllowList [authIndex] = [element];
            } else {
                basicAuthAllowList[authIndex].push(element)
            }
        }

        let authenticated = false;
        for (const basicAuth of basicAuthAllowList) {
            authenticated = auth[1] === basicAuth[0] && auth[2] === basicAuth[1]

            if (authenticated) break;
        }
        if (!authenticated) return res.send(401);

        req.prerender.authentication = {
            name: auth[1],
            password: auth[2]
        };

        return next();
    }
});

server.start();
