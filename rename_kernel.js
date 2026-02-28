const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            if (!dirPath.includes('node_modules') && !dirPath.includes('dist')) {
                walkDir(dirPath, callback);
            }
        } else {
            if (dirPath.endsWith('.ts') || dirPath.endsWith('.md') || dirPath.endsWith('.json')) {
                callback(dirPath);
            }
        }
    });
}

const targetDir = path.join(__dirname, 'packages');
const filesToProcess = [];

walkDir(targetDir, (filePath) => {
    filesToProcess.push(filePath);
});

filesToProcess.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;

    content = content.replace(/Kernel/g, 'Engine');
    content = content.replace(/kernel/g, 'engine');
    content = content.replace(/KERNEL/g, 'ENGINE');

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated content: ${file}`);
    }

    const basename = path.basename(file);
    if (basename.toLowerCase().includes('kernel')) {
        const newBasename = basename.replace(/kernel/i, (match) => {
            if (match === 'Kernel') return 'Engine';
            if (match === 'kernel') return 'engine';
            if (match === 'KERNEL') return 'ENGINE';
            return 'engine';
        });
        const newPath = path.join(path.dirname(file), newBasename);

        // git mv using execSync
        try {
            execSync(`git mv "${file}" "${newPath}"`);
            console.log(`Renamed: ${file} -> ${newPath}`);
        } catch (e) {
            // fallback to standard fs rename
            fs.renameSync(file, newPath);
            console.log(`Renamed (fs): ${file} -> ${newPath}`);
        }
    }
});
