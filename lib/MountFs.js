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

    that.fs = options.fs;
    that.mountedFsByMountPath = {};
    that.mountPaths = [];

    that.mount = function (mountPath, mountFs) {
        mountPath = mountPath.replace(/\/?$/, '/'); // Ensure trailing slash
        if (mountPath in that.mountedFsByMountPath) {
            throw new Error('MountFs.mount: Another fs is already mounted at ' + mountPath);
        }
        that.mountPaths.push(mountPath);
        that.mountedFsByMountPath[mountPath] = mountFs;
    };

    that.unmount = function (mountPath) {
        mountPath = mountPath.replace(/\/?$/, '/'); // Ensure trailing slash
        if (!(mountPath in that.mountedFsByMountPath)) {
            throw new Error('MountFs.unmount: No fs is mounted at ' + mountPath);
        }
        delete that.mountedFsByMountPath[mountPath];
        that.mountPaths.splice(that.mountPaths.indexOf(mountPath), 1);
    };

    function patchReaddirEntries(path, entries) {
        var pathNoTrailing = path.replace(/([^\/])\/$/, '$1');
        for (var i = 0 ; i < that.mountPaths.length ; i += 1) {
            var mountPath = that.mountPaths[i];
            var mountPathNoTrailing = mountPath.replace(/([^\/])\/$/, '$1');
            var mountPathFragments = mountPathNoTrailing.split('/');
            for (var j = mountPathFragments.length - 1 ; j > 0 ; j -= 1) {
                var mountPathPrefix = mountPathFragments.slice(0, j).join('/');
                if (mountPathPrefix === pathNoTrailing && entries.indexOf(mountPathFragments[j]) === -1) {
                    entries.push(mountPathFragments[j]);
                }
            }
        }
    }

    function findVirtualPathAndMountedFsAndMountPath(path) {
        var mountedFs = that.fs;
        var foundMountPath;
        for (var i = 0 ; i < that.mountPaths.length ; i += 1) {
            var mountPath = that.mountPaths[i];
            var mountPathNoTrailing = mountPath.replace(/([^\/])\/$/, '$1');

            if (path.indexOf(mountPathNoTrailing) === 0) {
                // Adjust the path so that the mountPath is not included
                // when we request the path from the mounted fs.
                path = path.replace(mountPathNoTrailing, '');

                // If we resolved something in the root of the mounted
                // file system, we should make sure that it is a root
                // relative path. Otherwise, it will break for fs's
                // mounted on the path '/'.
                path = path.replace(/^([^\/])/, '/$1') || '/';

                mountedFs = that.mountedFsByMountPath[mountPath];
                foundMountPath = mountPath;
                break;
            }
        }
        return [path, mountedFs, foundMountPath];
    }

    Object.keys(that.fs).forEach(function (fsMethodName) {
        var fsPropertyValue = that.fs[fsMethodName];
        // We want to avoid matching: ReadStream, Stats, _toUnixTimestamp
        if (typeof fsPropertyValue === 'function' && /^[a-z]/.test(fsMethodName)) {
            that[fsMethodName] = function (path) { // ...
                var mountedFsAndPath = findVirtualPathAndMountedFsAndMountPath(path);
                path = mountedFsAndPath[0];
                mountedFs = mountedFsAndPath[1];
                var mountPath = mountedFsAndPath[2];
                var args = [].slice.call(arguments);
                args[0] = path;
                if (/^(?:sym)?link(?:Sync)?$/.test(fsMethodName)) {
                    var mountedFsAndPathForTarget = findVirtualPathAndMountedFsAndMountPath(args[1]);
                    if (mountedFsAndPathForTarget[1] !== mountedFs) {
                        throw new Error('mountFs: Cannot fs.' + fsMethodName + ' between mounted file systems');
                    }
                    args[1] = mountedFsAndPathForTarget[0];
                }
                if (/(?:Sync|Stream)$/.test(fsMethodName)) {
                    var result;
                    try {
                        result = mountedFs[fsMethodName].apply(this, args);
                        if (fsMethodName === 'readdirSync') {
                            patchReaddirEntries(path, result);
                        }
                        return result;
                    } catch (err) {
                        if (fsMethodName === 'readdirSync' && err.code === 'ENOENT') {
                            var entries = [];
                            patchReaddirEntries(path, entries);
                            if (entries.length > 0) {
                                return entries;
                            }
                        }
                        if (err.name === 'OUTSIDETREE') {
                            args[0] = Path.resolve(mountPath, err.relativeTargetPath);
                            // TODO: There should be a mechanism for avoiding infinite loops:
                            result = that[fsMethodName].apply(this, args);
                            if (fsMethodName === 'readdirSync') {
                                patchReaddirEntries(path, result);
                            }
                            return result;
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
                    args.push(function (err, result) {
                        if (fsMethodName === 'readdir') {
                            if (!err) {
                                patchReaddirEntries(path, result);
                            } else if (err.code === 'ENOENT') {
                                var entries = [];
                                patchReaddirEntries(path, entries);
                                if (entries.length > 0) {
                                    err = undefined;
                                    result = entries;
                                }
                            }
                        }
                        if (err && err.name === 'OUTSIDETREE') {
                            args[0] = Path.resolve(mountPath, err.relativeTargetPath);
                            args.pop();
                            args.push(cb);
                            that[fsMethodName].apply(this, args);
                        } else {
                            cb.call(this, err, result);
                        }
                    });
                    return mountedFs[fsMethodName].apply(this, args);
                }
            };
        }
    });
};

MountFs.patchInPlace = function (fs) {
    fs = fs || require('fs');
    var fsShallowCopy = _.extend({}, fs),
        mountFs = new MountFs({ fs: fsShallowCopy });
    _.extend(fs, mountFs);
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
