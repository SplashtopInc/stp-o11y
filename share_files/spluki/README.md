# Spluki OTel

OpenTelemetry configs for Spluki (internal web service deployment platform
POC, repo `SplashtopInc/spluki`) in the TPE account (385284847228, us-west-2).
Spluki's EC2 control-plane host and its ECS app tasks send metrics and logs
over PrivateLink to a dedicated ECS OTel proxy, which forwards them to Cent.

- **Jira:** DT-3571
- **Proxy deployed by:** `stp-devops-k8s-observability/stacks/ecs-otel/tperd/usw2/` (Terraform)
- **Proxy runtime:** ECS Fargate (ARM64) in `stp-vpc-admin-us-west-2`, behind an
  internal NLB (TCP 4318) exposed as a VPC endpoint service
- **Config file rule:** published files are immutable — tasks / hosts fetch the
  URL on every start. A config change gets a new `-rN` file; a new collector
  minor starts at `-<minor>-r1`.

## Topology

```
[Spluki EC2 host]  otelcol-contrib (systemd)     [Spluki app task]  app + otelcol-contrib sidecar
        | OTLP/HTTP 4318                                  | OTLP/HTTP 4318
        v                                                 v
  interface endpoint (host VPC)                    interface endpoint (M6 VPC)
        \_________________ PrivateLink _________________/
                                 |
                                 v
  stp-vpc-admin-us-west-2: NLB + VPC endpoint service -> ECS OTel proxy
                                 |  splashtop.env=DEV / splashtop.stack=SPLUKI
                                 v
          cent-monitor (prod Cent, Mimir-DEV) + tperd-monitor (TPE Cent)
```

The PrivateLink consumer side (interface endpoints + their SGs), the host
collector and the ECS sidecar are deployed by Spluki; we own the proxy, the
NLB / endpoint service and the configs in this directory.

## Files

| File | Used by | Collector |
|------|---------|-----------|
| `otel-collector-config-proxy-0.161-r1.yaml` | ECS OTel proxy (`stacks/ecs-otel/tperd/usw2`) | `opentelemetry-collector-contrib:0.161.x` |

## Proxy notes

- Metrics and logs only: no traces pipeline and no trace service.
- No routing connectors: Spluki is DEV, so everything goes to both
  `cent-monitor` and `tperd-monitor` (same as the DEV route of the shared
  proxy config in `share_files/otel-collector/`).
- Self metrics: job `opentelemetry-collector-proxy`, tagged with
  `splashtop.datacenter` (= `ecs_cluster_name`) and `splashtop.region`.
- Environment variables (set by the Terraform task definition):
  `splashtop_env`, `splashtop_stack`, `ecs_cluster_name`, `ecs_region`,
  `otel_conf_debug_verbosity`, `otel_conf_{cent,tperd}_{queue_size,retry_max}`.
