# Unifiend Solo and credit continuity

Owner instruction, 31 October 2026: record all checkpoints, preserve the DeepSeek route, assess Docker as an alternative, describe Manus capabilities and use requested host tools one at a time. The source contract is config/unifiend-execution-policy.json. It records the desired policy and known verification limits; it is not proof that this policy has been applied to the host or that failover executes.

## Execution and memory

Registering a capability records its command, provider and readiness metadata. It does not have to start a process, install a model or run all agents. The intended mode is Solo, one heavy coding/build/model job at a time. Existing background services still consume RAM independently. A single job can exceed available memory, so Solo is not a capacity guarantee.

| Lifecycle | Disk and memory behavior |
| --- | --- |
| Registry entry or saved config | Disk metadata; no independent agent process |
| Downloaded CLI, image or model file | Disk use; installation/unpacking can use temporary RAM |
| Running CLI, editor or container | RAM/CPU while running; an idle live process still consumes resources |
| Installed package with a daemon | May start a service during installation; verify startup configuration |
| Stopped container | Files and metadata remain; its workload process is stopped; the Docker daemon can remain active |
| Paused container | Does not equal stopped; memory is retained |

Desired host setup: register capabilities, install selected required clients, disable autostart for NEW optional services, start tools on demand, share the existing Solo lock and measure idle/peak memory before resizing or loading local models. Preserve protected running services until their actual dependencies are inspected. No daemon was stopped or host resized by this checkpoint.

## Docker and DeepSeek

Docker is a container runtime, not a replacement model. It can package an agent and tools, or host a local model server through Docker Model Runner/Ollama. A usable local model still needs downloaded weights, an inference engine and sufficient RAM/CPU/GPU/context capacity. This changes where model computation runs; it does not make that computation free. No local model has been downloaded, selected or tested on Ocian-S-Host. Do not assume a 1 GiB host can run the proposed local fallback.

Keep DeepSeek's existing API route and Infisical reference. Do not remove it, overwrite it or silently replace it with another paid provider. The current OpenCode wrapper remains explicitly DeepSeek-only; Docker/local-model/Codex/Manus failover is not implemented by adding this registry.

On depleted credit/quota the intended behavior is to save the original task/checkpoint and pause only the affected model job, with an explicit reason. Continue independent available tool/audit work. Switching model providers requires verified credentials, entitlement, available quota/budget and task compatibility, with the same task identity. Never automatically replay an uncertain external write. No design can continue model inference without an available model/allowance.

## Manus actually exposed here

The connected tool catalog exposes asynchronous research, slides, websites, native mobile apps and video task creation. Tool exposure does not verify remaining credits, account scope, successful task execution, arbitrary SSH access or host installation. No task was launched for this inspection, and no Manus credit balance is claimed.

The official Manus API provides create/follow-up/results, projects, files and webhooks. A host integration can be a lightweight client to that Cloud API; it does not require putting the Manus model on the host. Existing supported OAuth/API bindings, callback authentication, task/result correlation and D1 receipts must be verified before declaring the host adapter usable.

## Current boundary and checkpoints

The existing GS route remains selected, GT/Go stays parked. Existing root Infisical works; service-user Infisical and fresh host model invocation are not verified. The public server pin is verified, while the SSH client key still needs a passphrase. Additional SSH_OWNER_KEY was inspected and is not an SSH private key. Host cutover remains unexecuted; the authorized existing-Console apply command remains available in ops/unifiend-console-apply.sh.

This policy is included as source metadata in the existing capability checkpoint, linked to the original canonical task and source SHA. D1/ATHENA, certificate integrity, Linear and CERT Sheet are updated/read back separately. An audit checkpoint is not host installation or runtime failover proof. Previous accepted history and archived store remain untouched.

p-stack: 24 Fix root causes; 28 Make operations idempotent; 34 Prove it works; 50 Unslop.
