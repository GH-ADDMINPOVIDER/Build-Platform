const payload = {
  ok: true,
  runtime: "DOCKER_WORKER",
  agent: false,
  role: "ISOLATED_REPRODUCE_TEST",
  network_policy: "DISABLED_AT_RUNTIME",
  filesystem_policy: "READ_ONLY_AT_RUNTIME",
  capabilities: ["reproduce", "sandbox_test", "dependency_isolation", "environment_matrix"]
};
process.stdout.write(JSON.stringify(payload));
