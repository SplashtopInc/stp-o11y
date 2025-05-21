# stp-o11y
[![Release Helm Charts](https://github.com/SplashtopInc/stp-o11y/actions/workflows/release.yml/badge.svg)](https://github.com/SplashtopInc/stp-o11y/actions/workflows/release.yml)
[![pages-build-deployment](https://github.com/SplashtopInc/stp-o11y/actions/workflows/pages/pages-build-deployment/badge.svg?branch=gh-pages)](https://github.com/SplashtopInc/stp-o11y/actions/workflows/pages/pages-build-deployment)

## Use this chart
```bash
helm repo add stp-o11y https://SplashtopInc.github.io/stp-o11y/
```

## Normal release 
- Clone this project
  - `git clone git@github.com:SplashtopInc/stp-o11y.git`
- Checkout new branch from master branch 
  - `git checkout -b feat-awesome-branch`
- make some magic 🪄
  - 🚨 🚨 🚨 do not forget update version in Chart.yaml 🚨 🚨 🚨
- Review by DevOps Team

## Github Page for share_files
`share_files` folder is used to serve common config or other files for o11y usage.

### Opentelemetry collector config.yaml
Opentelemetry allows to use HTTP URL to download config file. [link](https://opentelemetry.io/docs/collector/configuration/#location)

Use below as the CMD for opentelemetry collector container.
```
--config=https://splashtopinc.github.io/stp-o11y/share_files/<file-name>
```