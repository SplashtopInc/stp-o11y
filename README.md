# stp-o11y
[![Release Helm Charts](https://github.com/SplashtopInc/stp-o11y/actions/workflows/release.yml/badge.svg)](https://github.com/SplashtopInc/stp-o11y/actions/workflows/release.yml)
[![pages-build-deployment](https://github.com/SplashtopInc/stp-o11y/actions/workflows/pages/pages-build-deployment/badge.svg?branch=gh-pages)](https://github.com/SplashtopInc/stp-o11y/actions/workflows/pages/pages-build-deployment)

## Use this chart
```bash
helm repo add stp-o11y https://splashtopinc.github.io/stp-o11y/
```

## Normal release 
- Clone this project
  - `git clone git@github.com:SplashtopInc/stp-o11y.git`
- Checkout new branch from master branch 
  - `git checkout -b feat-awesome-branch`
- make some magic 🪄
  - 🚨 🚨 🚨 do not forget update version in Chart.yaml 🚨 🚨 🚨
- Review by DevOps Team
- After merged , git tag version `v?.?.?` will trigger [workflow](https://github.com/splashtopinc/stp-o11y/actions/workflows/release.yml) release to `gh-pages` branch
  - `git tag v?.?.? && git push origin v?.?.?`

## Local build chart 
```bash
git checkout master
helm dependency build --skip-refresh

## make some magic 🚨 🚨 🚨 do not forget update version in Chart.yaml 🚨 🚨 🚨

```

## Local package chart 
```bash
## make some magic 🚨 🚨 🚨 do not forget update version in Chart.yaml 🚨 🚨 🚨

helm package .

```

## Local release chart 
```bash
git switch gh-pages

git pull origin gh-pages

git add .

## 🚨 🚨 🚨 only need commit `index.yaml` and `stp-o11y-x.x.x.tgz` 🚨 🚨 🚨
git status

git ci -a -m "release version"

git push origin gh-pages
```