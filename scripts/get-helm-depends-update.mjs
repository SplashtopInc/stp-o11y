#!/usr/bin/env zx
const ChartYaml = YAML.parse(fs.readFileSync('./charts/stp-o11y/Chart.yaml', 'utf8'));
let repoList = {
    ChartYaml: [],
};
ChartYaml.dependencies.forEach( repo => {
  repoList.ChartYaml.push({repoName: repo.name, repository: repo.repository});
});

const { spawn } = require("child_process");
for (const [index, lock] of repoList.ChartYaml.entries()) {
    let helmAddRepo;
    if (lock.repository !== repoList.ChartYaml[index].repository){
        helmAddRepo = spawn('helm', ['repo', 'add', '--force-update', repoList.ChartYaml[index].repository.split('@')[1], lock.repository]);
    }else {
        helmAddRepo = spawn('helm', ['repo', 'add', '--force-update', lock.repoName, lock.repository]);
    }
    const helmActionList = [helmAddRepo];
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