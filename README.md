##  https://splashtopinc.github.io/stp-o11y/
chart github pages

## Use this chart
```bash
helm repo add helm-demo https://splashtopinc.github.io/stp-o11y/
```

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