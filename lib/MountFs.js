var Path = require('path'),
    _ = require('underscore');

var MountFs = module.exports = function MountFs(options) {
    var that = this;

    // Don't require the new operator:
    if (!(that instanceof MountFs)) {
        return new MountFs(options);
    }

    if (options && options.readFile) {
        options = {fs: options};
    } else {
        options = _.extend({}, options);
        options.fs = options.fs || require('fs');
    }

    var fs = options.fs,
        mountedFsByMountPath = {},
        mountPaths = [];

    that.mount = function (mountPath, mountFs) {
        mountPath = mountPath.replace(/\/?$/, '/'); // Ensure trailing slash
        if (mountPath in mountedFsByMountPath) {
            throw new Error('MountFs.mount: Another fs is already mounted at ' + mountPath);
        }
        mountPaths.push(mountPath);
        mountedFsByMountPath[mountPath] = mountFs;
    };

    that.unmount = function (mountPath) {
        if (!(mountPath in mountedFsByMountPath)) {
            throw new Error('MountFs.unmount: No fs is mounted at ' + mountPath);
        }
        delete mountedFsByMountPath[mountPath];
        mountPaths.splice(mountPaths.indexOf(mountPath), 1);
    };

    Object.keys(fs).forEach(function (fsMethodName) {
        var fsPropertyValue = fs[fsMethodName];
        if (typeof fsPropertyValue === 'function') {
            that[fsMethodName] = function (path) { // ...
                var mountedFs = fs;
                for (var i = 0 ; i < mountPaths.length ; i += 1) {
                    var mountPath = mountPaths[i];
                    if (path.indexOf(mountPaths) === 0) {
                        path = path.replace(mountPath, '/');
                        mountedFs = mountedFsByMountPath[mountPath];
                        break;
                    }
                }
                var args = [].slice.call(arguments);
                args[0] = path;
                if (/Sync$/.test(fsMethodName)) {
                    try {
                        return mountedFs[fsMethodName].apply(this, args);
                    } catch (err) {
                        if (err.name === 'OUTSIDETREE') {
                            args[0] = Path.resolve(mountPath, err.relativeTargetPath);
                            // TODO: There should be a mechanism for avoiding infinite loops:
                            return that[fsMethodName].apply(this, args);
                        } else {
                            throw err;
                        }
                    }
                } else {
                    var lastArgument = args[args.length - 1],
                        cb = function () {};
                    if (typeof lastArgument === 'function') {
                        cb = args.pop();
                    }
                    args.push(function (err) { // ...
                        if (err && err.name === 'OUTSIDETREE') {
                            args[0] = Path.resolve(mountPath, err.relativeTargetPath);
                            args.pop();
                            args.push(cb);
                            that[fsMethodName].apply(this, args);
                        } else {
                            cb.apply(this, arguments);
                        }
                    });
                    mountedFs[fsMethodName].apply(this, args);
                }
            };
        }
    });
};

MountFs.patchInPlace = function (fs) {
    fs = fs || require('fs');
    var fsShallowCopy = _.extend({}, fs),
        mountFs = new MountFs();
    _.extend(fs, fsPlusGit);
    fs.unpatch = function () {
        if ('unpatch' in fsShallowCopy) {
            fs.unpatch = fsShallowCopy.unpatch;
        } else {
            delete fs.unpatch;
        }
        Object.keys(mountFs).forEach(function (propertyName) {
            if (propertyName in fsShallowCopy) {
                fs[propertyName] = fsShallowCopy[propertyName];
            } else {
                delete fs[propertyName];
            }
        });
    };
};
