FROM node:22-alpine
WORKDIR /sandbox
COPY scripts/knowledge-sandbox-smoke.mjs /sandbox/smoke.mjs
USER node
ENTRYPOINT ["node", "/sandbox/smoke.mjs"]
