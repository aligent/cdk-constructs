FROM node:22-alpine

ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/lib/chromium/
ENV MEMORY_CACHE=0

RUN apk add --no-cache chromium tini

USER node
WORKDIR "/home/node"

COPY ./package.json .

RUN npm install --no-package-lock

COPY ./utils ./utils
COPY ./server.js .

EXPOSE 3000

HEALTHCHECK CMD netstat -ltn | grep -c 3000 

ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
