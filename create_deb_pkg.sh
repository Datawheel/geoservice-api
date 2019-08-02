#!/bin/bash
# Clear old builds
rm -rf dist/
# Run new build
npm run build
# Add shebang to beginning of file
printf '%s\n%s\n' "#!/usr/bin/node" "$(cat dist/index.js)" > dist/index.js
# Allow executable permissions
chmod +x dist/index.js
# Bundle!
./node_modules/node-deb/node-deb -- config/ dist/
