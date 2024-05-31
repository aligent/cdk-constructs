"use strict";

const pino = require("pino");

module.exports = pino({
    base: undefined,
    timestamp: false,
    messageKey: "message",
    customLevels: {
        render: 35,
    },
    level: process.env.LOG_LEVEL || "info",
    formatters: {
        level: label => {
            return {
                level: label,
            };
        },
    },
});
