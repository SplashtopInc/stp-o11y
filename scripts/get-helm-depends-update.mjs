#!/usr/bin/env zx
const ChartLock = YAML.parse(fs.readFileSync('./Chart.lock', 'utf8'));
const ChartYaml = YAML.parse(fs.readFileSync('./Chart.yaml', 'utf8'));
let repoList = {
    ChartLock: [],
    ChartYaml: [],
};
ChartLock.dependencies.forEach( repo => {
  repoList.ChartLock.push({repoName: repo.name, repository: repo.repository});
});

ChartYaml.dependencies.forEach( repo => {
  repoList.ChartYaml.push({repoName: repo.name, repository: repo.repository});
});

console.log(repoList)

if (repoList.ChartYaml.length !== repoList.ChartLock.length) {
    throw new Error(chalk.red(`Please run helm dependency update at local and commit Chart.yaml and Chart.lock`));
}

const { spawn } = require("child_process");
for (const [index, lock] of repoList.ChartLock.entries()) {
    let helmAddRepo;
    if (lock.repository !== repoList.ChartYaml[index].repository){
        if (!repoList.ChartYaml[index].repository.includes('oci://')){
            helmAddRepo = spawn('helm', ['repo', 'add', '--force-update', repoList.ChartYaml[index].repository.split('@')[1], lock.repository]);
        }
    }else {
        if (!repoList.ChartYaml[index].repository.includes('oci://')){
            helmAddRepo = spawn('helm', ['repo', 'add', '--force-update', lock.repoName, lock.repository]);
        }
    }
    const helmActionList = [helmAddRepo];
    if (helmAddRepo){
        for (const action of helmActionList) {
        action.stdout.on("data", data => {
           console.log(`stdout: ${data}`);
        });
    
        action.stderr.on("data", data => {
            console.log(`stderr: ${data}`);
        });
        
        action.on("close", code => {
            console.log(`child process exited with code ${code}`);
        });
        }
    }
}