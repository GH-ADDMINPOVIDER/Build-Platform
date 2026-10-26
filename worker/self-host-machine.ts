/**
 * Canonical host identity for the existing WAVE self-host lane.
 *
 * SELF_HOST_MACHINE is a stable system label. The physical hostname and
 * GitHub runner registration remain separate so a display rename cannot break
 * the registered runner or historical evidence.
 */
export const SELF_HOST_MACHINE = Object.freeze({
  id: "SELF_HOST_MACHINE",
  display_name: "SELF HOST_MACHINE",
  physical_hostname: "OCIAN-S-Host",
  digitalocean_name: "OCIAN-S-Host",
  droplet_id: "604432491",
  runner_registration: "wave-runner-01",
  runner_labels: ["self-hosted", "linux", "x64", "wave"] as const,
  agent_id: "codex-selfhost:wave-runner-01",
  runner_count: 1,
  historical_aliases: ["wave-runner-01", "OCIAN_S-Host"] as const,
});

export const SELF_HOST_RUNNER_ID = SELF_HOST_MACHINE.runner_registration;
export const SELF_HOST_AGENT_ID = SELF_HOST_MACHINE.agent_id;

export function selfHostMachineMetadata() {
  return {
    id: SELF_HOST_MACHINE.id,
    display_name: SELF_HOST_MACHINE.display_name,
    physical_hostname: SELF_HOST_MACHINE.physical_hostname,
    digitalocean_name: SELF_HOST_MACHINE.digitalocean_name,
    droplet_id: SELF_HOST_MACHINE.droplet_id,
    runner_registration: SELF_HOST_MACHINE.runner_registration,
    runner_labels: [...SELF_HOST_MACHINE.runner_labels],
    agent_id: SELF_HOST_MACHINE.agent_id,
    runner_count: SELF_HOST_MACHINE.runner_count,
    state: "UNVERIFIED_BY_THIS_REQUEST" as const,
  };
}
