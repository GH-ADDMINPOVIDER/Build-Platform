FROM docker.n8n.io/n8nio/n8n:latest

USER root
COPY --chown=node:node workflows /opt/ogenic/workflows
COPY --chown=node:node entrypoint-ogenic.sh /opt/ogenic/entrypoint-ogenic.sh
RUN chmod 0755 /opt/ogenic/entrypoint-ogenic.sh
USER node

ENTRYPOINT ["/opt/ogenic/entrypoint-ogenic.sh"]
