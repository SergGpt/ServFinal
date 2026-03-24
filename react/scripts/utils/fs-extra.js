const fs = require('fs');
const path = require('path');

function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function emptyDirSync(dir) {
    ensureDirSync(dir);

    for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stat = fs.lstatSync(fullPath);

        if (stat.isDirectory()) {
            emptyDirSync(fullPath);
            fs.rmdirSync(fullPath);
        } else {
            fs.unlinkSync(fullPath);
        }
    }
}

function copySync(src, dest, options = {}) {
    const { dereference = false, filter } = options;

    if (filter && !filter(src)) {
        return;
    }

    const stat = dereference ? fs.statSync(src) : fs.lstatSync(src);

    if (stat.isDirectory()) {
        ensureDirSync(dest);
        for (const entry of fs.readdirSync(src)) {
            copySync(path.join(src, entry), path.join(dest, entry), options);
        }
        return;
    }

    ensureDirSync(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

module.exports = Object.assign({}, fs, {
    emptyDirSync,
    copySync,
});
