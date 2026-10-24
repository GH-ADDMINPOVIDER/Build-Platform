FROM node:22-alpine
WORKDIR /app
COPY worker/task-envelope-contract.ts /app/worker/task-envelope-contract.ts
COPY worker/connector-endpoint-api.ts /app/worker/connector-endpoint-api.ts
COPY worker/ccs-authority.ts /app/worker/ccs-authority.ts
COPY infra/tmn-a2a-ssh/ccs-multi-manifest.json /app/infra/tmn-a2a-ssh/ccs-multi-manifest.json
COPY infra/tmn-a2a-ssh/ccs-multi.mjs /app/infra/tmn-a2a-ssh/ccs-multi.mjs
COPY infra/tmn-a2a-ssh/server.mjs /app/infra/tmn-a2a-ssh/server.mjs
USER 10001:10001
EXPOSE 18761
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:18761/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--experimental-strip-types","/app/infra/tmn-a2a-ssh/server.mjs"]
