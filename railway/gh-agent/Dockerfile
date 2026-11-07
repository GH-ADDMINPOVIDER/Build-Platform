# Self-hosted job machine for GitHub Actions, built from GitHub's official release.
# No secrets in this file. Secrets arrive as Railway variables at run time.
FROM ubuntu:24.04
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl jq git ca-certificates tar gzip unzip python3 \
 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash agent && mkdir -p /opt/agent && chown agent:agent /opt/agent
WORKDIR /opt/agent
RUN set -eux; \
    V="$(curl -fsS https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')"; \
    curl -fsSL -o pkg.tgz "https://github.com/actions/runner/releases/download/v${V}/actions-runner-linux-x64-${V}.tar.gz"; \
    tar xzf pkg.tgz; rm pkg.tgz; \
    ./bin/installdependencies.sh; \
    chown -R agent:agent /opt/agent
COPY --chown=agent:agent entrypoint.sh /opt/agent/entrypoint.sh
RUN chmod +x /opt/agent/entrypoint.sh
USER agent
ENTRYPOINT ["/opt/agent/entrypoint.sh"]
