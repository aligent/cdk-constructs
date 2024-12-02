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
"use strict";

const prerender = require("prerender");
const util = require("prerender/lib/util");
const crypto = require("crypto");
const logger = require("./utils/logger");

/**
 * Replace prerender's util log function with our own which uses pino to log
 *
 * @param  {...any} args
 * @returns
 */
util.log = function (...args) {
  if (process.env.DISABLE_LOGGING) {
    return;
  }

  logger.info(args.join(" "));
};

const server = prerender({
  chromeFlags: [
    "--no-sandbox",
    "--headless",
    "--disable-gpu",
    "--disable-web-security",
    "--remote-debugging-port=9222",
    "--hide-scrollbars",
    "--disable-dev-shm-usage",
  ],
  forwardHeaders: true,
  chromeLocation: "/usr/bin/chromium-browser",
});

// Healthcheck endpoint
server.use({
  beforeSend: (req, res, next) => {
    if (req.prerender.url === "health") {
      return res.send(200, "OK");
    }

    return next();
  },
});

server.use({
  beforeSend: (req, res, next) => {
    const ms = new Date().getTime() - req.prerender.start.getTime();

    logger.render({
      time: ms,
      path: req.prerender.url,
      status: req.prerender.statusCode,
      ip: req.socket.remoteAddress,
      headers: req.prerender.headers,
      origin: req.headers,
    });

    return next();
  },
});

const tokenJson = JSON.parse(process.env.TOKEN_SECRET);
const tokens = Object.keys(tokenJson);

const tokenAllowList = tokens.toString().split(",");

server.use({
  requestReceived: (req, res, next) => {
    // Log "x-prerender-user-agent" value forwarded from CloudFront/Lambda@edge that contains the original User-Agent value. If not present, e.g. requests from ELB, default to "user-agent" value.
    const userAgent =
      req.get("x-prerender-user-agent") || req.get("user-agent");

    logger.info(
      `${new Date().toISOString()} User-Agent: "${userAgent}" ${req.prerender.reqId} ${req.prerender.url}`
    );
    let auth = req.headers["x-prerender-token"];

    if (!auth) {
      logger.info(
        `${new Date().toISOString()} "${userAgent}" ${req.prerender.reqId} Authentication header not found.`
      );

      return res.send(401);
    }

    // compare credentials in header to list of allowed credentials and corresponding domains
    let authenticated = false;
    for (const token of tokenAllowList) {
      let domains = tokenJson[token].split(",");
      for (const domain of domains) {
        authenticated =
          auth === token &&
          req.url
            .replace("https%3A%2F%2F", "https://")
            .startsWith(`/${domain}`);
        if (authenticated) break;
      }
      if (authenticated) break;
    }
    if (!authenticated) {
      logger.info(
        `${new Date().toISOString()} "${userAgent}" ${req.prerender.reqId} Authentication Failed.`
      );
      return res.send(401);
    }

    return next();
  },
  // Append a custom header to indicate the response is from Prerender
  beforeSend: function (req, res, next) {
    res.setHeader("x-prerender-requestid", crypto.randomUUID());
    return next();
  },
});

server.use(prerender.blacklist());

if (process.env.ENABLE_PRERENDER_HEADER.toLowerCase() === "true") {
  // Let headless chrome send 'X-Prerender: 1' in the request for any specicial handling such as disabling geo-redirection.
  // Ensure that the "access-control-allow-headers" header of any backend systems allows "x-prerender" if CORS is configured.

  server.use(prerender.sendPrerenderHeader());
}

var he = require("he");
var s3 = new (require("aws-sdk").S3)({
  params: { Bucket: process.env.S3_BUCKET_NAME },
});

server.use({
  // The requestReceived and pageLoaded functions are a modified version of
  // httpHeader plugin - https://github.com/prerender/prerender/blob/478fa6d0a5196ea29c88c69e64e72eb5507b6d2c/lib/plugins/httpHeaders.js combined with
  // s3cache plugin - https://github.com/prerender/prerender-aws-s3-cache/blob/98707fa0f787de83aa41583682cd2c2d330a9cca/index.js
  requestReceived: function (req, res, next) {
    const fetchCachedObject = function (err, result) {
      if (!err && result) {
        logger.info(`Found cached object: ${key}`);

        if (result.Metadata.location) {
          res.setHeader("Location", result.Metadata.location);
        }
        // default 200 for legacy objects that do not have Metadata.httpreturncode defined
        return res.send(result.Metadata.httpreturncode || 200, result.Body);
      } else {
        logger.error(
          `Fetching cached object from S3 bucket failed with error: ${err.code}`
        );
      }
      next();
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }

    var key = req.prerender.url;

    if (process.env.S3_PREFIX_KEY) {
      key = process.env.S3_PREFIX_KEY + "/" + key;
    }

    s3.getObject(
      {
        Key: key,
      },
      fetchCachedObject
    );
  },
});

server.use(prerender.removeScriptTags());

server.use({
  pageLoaded: function (req, res, next) {
    const statusCodesToCache = ["200"];

    if (process.env.ENABLE_REDIRECT_CACHE.toLowerCase() === "true") {
      statusCodesToCache.push("301", "302", "308");
    }

    if (process.env.ENABLE_NOTFOUND_CACHE.toLowerCase() === "true") {
      statusCodesToCache.push("404");
    }

    var s3Metadata = {};
    const cacheObject = function (err, result) {
      if (!err && result) {
        logger.info(
          `Cached object ${key} already present. Skipping caching...`
        );
      } else {
        logger.info(
          `Caching the object ${req.prerender.url} with statusCode ${req.prerender.statusCode}`
        );
        s3.putObject(
          {
            Key: key,
            ContentType: "text/html;charset=UTF-8",
            StorageClass: "REDUCED_REDUNDANCY",
            Body: req.prerender.content,
            Metadata: s3Metadata,
          },
          function (err, result) {
            logger.info(result);
            if (err) logger.error(err);
          }
        );
      }
    };

    // Inspect prerender meta tags and update response accordingly
    if (req.prerender.content && req.prerender.renderType == "html") {
      const statusMatchRegex =
        /<meta[^<>]*(?:name=['"]prerender-status-code['"][^<>]*content=['"]([0-9]{3})['"]|content=['"]([0-9]{3})['"][^<>]*name=['"]prerender-status-code['"])[^<>]*>/i;
      const headerMatchRegex =
        /<meta[^<>]*(?:name=['"]prerender-header['"][^<>]*content=['"]([^'"]*?): ?([^'"]*?)['"]|content=['"]([^'"]*?): ?([^'"]*?)['"][^<>]*name=['"]prerender-header['"])[^<>]*>/gi;
      const head = req.prerender.content.toString().split("</head>", 1).pop();

      const statusMatch = statusMatchRegex.exec(head);
      if (statusMatch) {
        req.prerender.statusCode = statusMatch[1] || statusMatch[2];
        req.prerender.content = req.prerender.content
          .toString()
          .replace(statusMatch[0], "");
      }

      let headerMatch = headerMatchRegex.exec(head);
        while (headerMatch) {
            const decoded = he.decode(headerMatch[2] || headerMatch[4])
            if (headerMatch[1].toLowerCase() == "location") {
                s3Metadata.location = decoded
                if (!decoded.startsWith('http') && !decoded.startsWith('/')) {
                    s3Metadata.location = '/' + s3Metadata.location
                }
            } else {
                s3Metadata.location = ""
            }
        res.setHeader(headerMatch[1] || headerMatch[3], s3Metadata.location);
        req.prerender.content = req.prerender.content
          .toString()
          .replace(headerMatch[0], "");
        headerMatch = headerMatchRegex.exec(head);
      }

      if (["301", "302", "307", "308"].includes(req.prerender.statusCode)) {
        const permanentlyOrTemporarily = ["301", "308"].includes(
          req.prerender.statusCode
        )
          ? "permanently"
          : "temporarily";
        req.prerender.content = `This page has ${permanentlyOrTemporarily} moved, redirecting to <a href="${s3Metadata.location}">${s3Metadata.location}</a>...`;
      }

      if (statusCodesToCache.includes(req.prerender.statusCode.toString())) {
        s3Metadata.httpreturncode = req.prerender.statusCode.toString();

        var key = req.prerender.url;

        if (process.env.S3_PREFIX_KEY) {
          key = process.env.S3_PREFIX_KEY + "/" + key;
        }
        s3.getObject(
          {
            Key: key,
          },
          cacheObject
        );
      } else {
        // Skip caching for the http response codes not in the list, such as 404
        logger.info(
          `StatusCode ${req.prerender.statusCode} for ${req.prerender.url} is not in the cachable code list. Returning without caching the result.`
        );
      }

      next();
    }
  },
});

server.start();
