# Spluki OTel Collectors

OpenTelemetry Collector configs for Spluki (internal web service deployment
platform POC, repo `SplashtopInc/spluki`) in the TPE account (385284847228,
us-west-2). Spluki's EC2 control-plane host and its ECS app tasks send metrics
and logs over PrivateLink to a dedicated ECS OTel proxy, which forwards them to
Cent.

- **Jira:** DT-3571
- **Proxy:** `stp-devops-k8s-observability/stacks/ecs-otel/tperd/usw2/` (Terraform).
  Same shape as every other ecs-otel leaf (collector + 2 trace services, shared
  configs in `share_files/otel-collector/`), but fronted by an internal NLB +
  VPC endpoint service instead of an ALB.
- **Endpoint service:** `com.amazonaws.vpce.us-west-2.vpce-svc-05e5c3dec4430508d`
- **Config file rule:** published files are immutable — hosts and tasks fetch the
  URL on every start. A config change gets a new `-rN` file; a new collector minor
  starts at `-<minor>-r1`.

## Topology

```
[Spluki EC2 host]  otelcol-contrib (RPM, systemd)    [Spluki app task]  app + otelcol-contrib sidecar
  host_metrics + file_log (app log)                    awsecscontainermetrics
        | OTLP/HTTP 4318                                       | OTLP/HTTP 4318
        v                                                      v
  interface endpoint (stp-vpc-spluki-usw2)          interface endpoint (spluki-m6-dev-vpc)
        \__________________ PrivateLink (one-way) __________________/
                                    |
                                    v
  stp-vpc-admin-us-west-2: NLB + VPC endpoint service -> ECS OTel proxy
                                    |  splashtop.env=DEV / splashtop.stack=SPLUKI
                                    v
            cent-monitor (prod Cent, Mimir-DEV / Loki-DEV) + tperd-monitor (TPE Cent)
```

Who deploys what:

- **DevOps:** the proxy, the NLB + endpoint service, and the configs in this directory.
- **Spluki:** the PrivateLink consumer side (one interface endpoint + its SG in each
  of the two VPCs), the host collector, and the ECS sidecar.

The NLB security group checks PrivateLink traffic against the client's own IP and
only admits `10.100.210.0/24` (stp-vpc-spluki-usw2) and `10.200.0.0/16`
(spluki-m6-dev-vpc) on 4318. Sending from another VPC needs that list extended
(`privatelink_allowed_cidrs` in the Terraform leaf).

## Files

| File | Runs on | What it sends |
|------|---------|---------------|
| `otel-collector-config-ec2-0.161-r1.yaml` | control-plane EC2 (otelcol-contrib 0.161.x linux arm64 RPM) | host metrics; `storage/logs/spluki.log*` as-is (one record per log record, a traceback kept with its record) |
| `otel-collector-config-ecs-sidecar-0.161-r1.yaml` | sidecar in each app task (`opentelemetry-collector-contrib:0.161.x`, arm64) | ECS task / container CPU, memory, network, storage from the task metadata endpoint; `service.name` = task family |

No traces from either. Neither opens a receiving port.

The app log is shipped unparsed: each line is `<time> level=… logger=… request_id=… <message key=value …>`,
so fields are extracted at query time (LogQL `| logfmt`, or a regexp for the
timestamp). The `spluki.service` journal is not collected — it mostly repeats the
app log (the unit copies every record to stderr), plus uvicorn's access log.

## Environment

| Variable | Used by | Value |
|----------|---------|-------|
| `SPLUKI_OTEL_ENDPOINT` | both | `http://<interface endpoint DNS name>:4318` — the endpoint in the collector's own VPC. Plain HTTP: the NLB is a TCP listener and the path never leaves PrivateLink. |
| `GOMEMLIMIT` | both | soft Go heap limit, kept below the process / container memory limit (see below) |
| `ECS_CONTAINER_METADATA_URI_V4` | sidecar | injected by Fargate; nothing to set |

## EC2 host install (sketch — verify the RPM's unit on the host)

1. Install `otelcol-contrib_0.161.0_linux_arm64.rpm` from the
   opentelemetry-collector-releases GitHub release.
2. Point it at the published config (`/etc/otelcol-contrib/otelcol-contrib.conf`):
   ```
   OTELCOL_OPTIONS="--config=https://splashtopinc.github.io/stp-o11y/share_files/otel-collector-spluki/otel-collector-config-ec2-0.161-r1.yaml"
   ```
3. systemd drop-in (`systemctl edit otelcol-contrib`):
   ```ini
   [Service]
   # reads the app log under /home/ec2-user (0700)
   User=root
   Group=root
   # the host has 3.8 GB and spluki.service may take 3G
   MemoryMax=256M
   Environment=GOMEMLIMIT=180MiB
   Environment=SPLUKI_OTEL_ENDPOINT=http://<endpoint DNS>:4318
   ```
4. `systemctl daemon-reload && systemctl enable --now otelcol-contrib`.

The collector keeps its read position in `/var/lib/otelcol-contrib/file_storage`,
so a restart neither re-sends nor skips log lines. It starts at the end of the
existing log (no backfill).

## ECS sidecar (task definition sketch)

App tasks have no direct internet egress (only through Spluki's egress proxy), so
the sidecar must not fetch its config from GitHub Pages at startup the way the
proxy does. Ship the file with the task instead, either way:

- **Bake it into the mirrored image** (preferred — config and collector version
  move together under one image tag):
  ```dockerfile
  FROM ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.161.0
  COPY otel-collector-config-ecs-sidecar-0.161-r1.yaml /etc/otelcol-contrib/spluki-sidecar.yaml
  ```
  and run it with `"command": ["--config", "/etc/otelcol-contrib/spluki-sidecar.yaml"]`.
- **Or pass it in the environment:** put the file's content in a variable such as
  `SPLUKI_OTEL_CONFIG` and use `"command": ["--config", "env:SPLUKI_OTEL_CONFIG"]`.

```json
{
  "name": "otel-collector",
  "image": "<account>.dkr.ecr.us-west-2.amazonaws.com/spluki-m6-dev/opentelemetry-collector-contrib:0.161.0-spluki-sidecar-r1",
  "essential": false,
  "memory": 128,
  "memoryReservation": 64,
  "command": ["--config", "/etc/otelcol-contrib/spluki-sidecar.yaml"],
  "environment": [
    {"name": "SPLUKI_OTEL_ENDPOINT", "value": "http://<endpoint DNS>:4318"},
    {"name": "GOMEMLIMIT", "value": "100MiB"}
  ],
  "logConfiguration": {"logDriver": "awslogs", "options": {
    "awslogs-group": "<same group as the app>",
    "awslogs-region": "us-west-2",
    "awslogs-stream-prefix": "otel-collector"
  }}
}
```

- `essential: false` — the app keeps running if the sidecar dies.
- A separate stream prefix keeps sidecar output out of `spluki logs`, which reads
  the `app` container only. The sidecar logs at `warn` and above.
- The task SG needs egress tcp 4318 to the M6 interface endpoint's SG.

## Resulting data

- Metrics land in Mimir-DEV with `splashtop_env="DEV"`, `splashtop_stack="SPLUKI"`.
  Host metrics carry `host.name` / EC2 attributes and `service.name="spluki"`;
  task metrics carry the `aws.ecs.*` attributes and `service.name=<task family>`.
- Logs land in Loki-DEV as the raw app-log lines, with `log.file.name`, the host
  attributes and `service.name="spluki"`; parse `level` / `logger` / `request_id`
  at query time.
