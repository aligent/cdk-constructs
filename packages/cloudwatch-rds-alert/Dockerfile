ARG node_version=16-alpine3.13
FROM node:${node_version}

RUN mkdir /app /cdk /home/node/.config
RUN chown node:node /app /cdk /home/node/.config

RUN apk update && \
    apk add sudo bash shadow && \
    rm -rf /var/cache/apk/*

USER node
COPY --chown=node:node ./app /app

WORKDIR /app

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

RUN npm ci
RUN npm install -g aws-cdk-lib aws-cdk esbuild
ENV PATH="/home/node/.npm-global/bin:${PATH}"

USER root

COPY entrypoint.sh /docker-entrypoint.sh
RUN chmod 0755 /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
