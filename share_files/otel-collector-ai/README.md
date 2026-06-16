# AI OTel Collector

OpenTelemetry Collector that ingests telemetry from Splashtop's AI tooling
(Claude Code SDK and Cowork / claude.ai) and forwards it to Cent Monitor's
Mimir + Loki stack.

- **Jira:** DT-3242
- **Deployed by:** `stp-devops-k8s-observability/ai_otel_collector/` (Terraform)
- **Runtime:** ECS Fargate, VPC `stp-vpc-pub-us-west-2`
- **Image:** `ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.154.0`

> **Distribution & version notes**
> - The `contrib` distro is required (not `k8s`/`core`): we use
>   `bearertokenauth`, `resource_detection` (ECS detector), `otlp_http`, and
>   the Prometheus receiver — none of which are bundled in the slimmer
>   distributions.
> - Self-telemetry is configured with the **declarative `readers:` format**
>   (`service.telemetry.metrics.readers[].pull.exporter.prometheus`). The
>   older `service.telemetry.metrics.address` shortcut was deprecated in
>   0.123 and will eventually be removed — do **not** revert to it.

## Why this collector exists

Cent Monitor's Mimir / Loki are reachable only via VPC Endpoints inside
`stp-vpc-pub-us-west-2`. AI clients (Claude Code SDK running on engineer
laptops, Cowork running in the browser) cannot reach those endpoints
directly. This collector sits inside the VPC, exposes a public OTLP/HTTP
ingress with bearer-token auth, and relays the data into Mimir/Loki.

## Topology

```
Claude Code SDK ──Bearer──▶ :4319 (otlp/code)  ─┬─▶ Mimir   (metrics)
                                                ├─▶ Loki    (logs)
                                                └─▶ debug   (traces, until Phase 5)

Cowork (claude.ai) ──Bearer──▶ :4318 (otlp/cowork) ──▶ Loki (logs only)

self /metrics :8888 ──▶ prometheus/self ──▶ Mimir
```

## Per-scope design

| Scope    | Port | Signals               | Exporter(s)               | Rationale                                                                 |
|----------|------|-----------------------|---------------------------|---------------------------------------------------------------------------|
| `code`   | 4319 | metrics, logs, traces | Mimir, Loki, debug        | Claude Code SDK emits the full triad; traces stay on `debug` until Tempo. |
| `cowork` | 4318 | logs only             | Loki                      | claude.ai (Cowork) only emits log events; no metrics/traces by design.    |
| `self`   | 8888 | metrics               | Mimir                     | Collector self-observability; tagged separately so it can be filtered.    |

## Auth model — bearer token with rotation slot

Each scope has its own `bearertokenauth` extension that accepts **two**
tokens at the same time:

```yaml
bearertokenauth/code:
  scheme: Bearer
  tokens:
    - ${env:CODE_TOKEN_CURRENT}
    - ${env:CODE_TOKEN_PREVIOUS}
```

This lets us rotate the UI-facing token without a tight cutover:

1. Generate a new token, write it into the `CURRENT` slot, push the old
   value into `PREVIOUS`.
2. Restart the task — both tokens are now valid.
3. Flip the client UI to the new token at any time.
4. Once all clients are confirmed migrated, clear `PREVIOUS` on the next
   rotation.

Rotation is driven by `scripts/rotate-token.sh` in the Terraform module.

## Required environment variables

| Variable                     | Used by                          | Source                              |
|------------------------------|----------------------------------|-------------------------------------|
| `CODE_TOKEN_CURRENT`         | `bearertokenauth/code`           | Secrets Manager (rotated)           |
| `CODE_TOKEN_PREVIOUS`        | `bearertokenauth/code`           | Secrets Manager (rotated)           |
| `COWORK_TOKEN_CURRENT`       | `bearertokenauth/cowork`         | Secrets Manager (rotated)           |
| `COWORK_TOKEN_PREVIOUS`      | `bearertokenauth/cowork`         | Secrets Manager (rotated)           |
| `splashtop_env`              | `resource` processor             | Terraform task definition           |
| `splashtop_stack`            | `resource` processor             | Terraform task definition           |
| `ecs_cluster_name`           | `resource/self-metrics`          | Terraform task definition           |
| `ecs_region`                 | `resource/self-metrics`          | Terraform task definition           |
| `otel_conf_debug_verbosity`  | `debug` exporter                 | Terraform task definition (e.g. `basic`) |

## Resource attributes applied

- **All upstream signals** get `splashtop.env`, `splashtop.stack` plus the
  ECS-detected attributes (cluster ARN, task ARN, etc.) via
  `resource_detection/ecs`.
- **Self-metrics** additionally get `splashtop.datacenter`
  (= ECS cluster name) and `splashtop.region`, so dashboards can split the
  collector's own metrics from the customer payload.
- The collector's own OTel identity is set via
  `service.telemetry.resource` to `service.name=ai-otel-collector` /
  `service.namespace=splashtop.observability`, so the `target_info`
  metric (and any future OTLP-routed self-telemetry) reports this
  collector — not the default `otelcol-contrib` — as its source.

## Client IP enrichment (logs only)

Both log pipelines (`logs/code`, `logs/cowork`) run an
`attributes/inject_client_ip` processor that copies the inbound
`X-Forwarded-For` HTTP header into the `client.address` log-record
attribute (OTel semantic convention name for the originating client).

For this to work, both `otlp/*` receivers have `include_metadata: true`
set — without that, the `from_context` action can't see HTTP headers.

The processor uses `action: insert`, so if a client SDK ever sets
`client.address` itself, that value wins.

**Topology assumption — single proxy layer.** The path is
`Claude Code SDK → ALB → this collector`. ALB writes the originating
client IP into `X-Forwarded-For`, and because nothing in front of ALB
adds to that header, it arrives as a single IP — no parsing needed.

If a second proxy layer is ever inserted in front of ALB (CloudFront,
WAF, another reverse proxy), the header becomes a comma-separated chain
(`client, proxy1`) and `client.address` would receive the whole string.
At that point, add a `transform` processor to extract the first segment.

Not applied to `metrics/*` or `traces/*`: per-request client IP would
explode metric cardinality and traces already carry it via SDK
semantic conventions when present.

## Exporter endpoints

Both are VPC Endpoints inside `stp-vpc-pub-us-west-2`, sharing tenant
`X-Scope-OrgID: "2"`:

- **Mimir** — `http://vpce-042606ecb2790cb67-4aoacwzl.vpce-svc-096f3d4dfb838e70c.us-west-2.vpce.amazonaws.com/otlp`
- **Loki**  — `http://vpce-06062869502f5c746-orawao1f.vpce-svc-079376ab802676497.us-west-2.vpce.amazonaws.com/otlp`
- **Traces** — `debug` exporter only; Tempo PrivateLink is out of scope for
  DT-3242 and will be wired in Phase 5.

## Health & operational endpoints

| Port  | Purpose                                                    |
|-------|------------------------------------------------------------|
| 4318  | OTLP/HTTP ingress — Cowork scope                           |
| 4319  | OTLP/HTTP ingress — Claude Code scope                      |
| 8888  | Collector self-metrics (`/metrics`, Prometheus format)     |
| 13133 | `health_check` extension at `/health` — ECS task health probe target |

## Related references

- Knowledge note: `Wei/knowledge/knowledge-otel-collector-ai.md`
- Terraform module: `stp-devops-k8s-observability/ai_otel_collector/`
- Cent Monitor environment: `aws-sso-ocstack` (apse2 / cs6yvm)
