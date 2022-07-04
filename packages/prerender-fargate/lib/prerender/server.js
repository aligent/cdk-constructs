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

server.start();