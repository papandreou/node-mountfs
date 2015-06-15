# mountfs

Allows to mount an fs-module compatible module as you would mount a
device on linux.

# Usage

```js
var fs = require('fs');
var mountFs = require('mountfs');

mountFs.patchInPlace();

// calling the patchInPlace method, will add two methods to the fs
// module; mount and unmount.

fs.mount('/home/john/mountPath', fileSystemToBeMounted);

// the variable fileSystemToBeMounted should be a fs-compatible
// implementation. It will transparently be mounted and all methods on
// fs will work as you expect.

fs.readFileSync('/home/john/mountPath/foobar.txt', 'utf-8');

fs.umount('/home/john/mountPath');
```
