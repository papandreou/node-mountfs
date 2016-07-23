var expect = require('unexpected')
    .clone()
    .installPlugin(require('unexpected-sinon'));
var Path = require('path'),
    fs = require('fs'),
    passError = require('passerror'),
    sinon = require('sinon'),
    MountFs = require('../lib/MountFs');

describe('MountFs', function () {
    describe('with a fake fs implementation mounted at <testDir>/fakeFs', function () {
        var mountedFs,
            mountFs;
        beforeEach(function () {
            mountedFs = {
                readFileSync: sinon.spy(function () {
                    return "foobar";
                })
            };
            mountFs = new MountFs();
            mountFs.mount(Path.resolve(__dirname, 'fakeFs'), mountedFs);
        });

        it('should be possible to read a file outside a mounted fs', function () {
            var content = mountFs.readFileSync(Path.resolve(__dirname, '..', 'package.json'), 'utf-8');
            expect(content, 'to match', /^{/);
        });

        it('should proxy to mountedFs.readFileSync and strip away .../fakeFs from the path', function () {
            mountFs.readFileSync(Path.resolve(__dirname, 'fakeFs', 'quux'));
            expect(mountedFs.readFileSync, 'was called once');
            expect(mountedFs.readFileSync, 'was called with', '/quux');
        });

        it('should proxy readFile outside a mounted location to the built-in fs module', function () {
            mountFs.readFileSync(__filename);
            expect(mountedFs.readFileSync, 'was not called');
        });

        describe('#readdir()', function () {
            it('should include a fakeFs entry in the results for the test directory', function (done) {
                mountFs.readdir(__dirname, passError(done, function (names) {
                    expect(names, 'to contain', 'fakeFs');
                    done();
                }));
            });
        });

        describe('#readdirSync()', function () {
            it('should include a fakeFs entry in the results for the test directory', function (done) {
                expect(mountFs.readdirSync(__dirname), 'to contain', 'fakeFs');
                done();
            });
        });

        describe('#stat()', function () {
            it.skip('should report the fakeFs entry as a directory', function (done) {
                mountFs.stat(Path.resolve(__dirname, 'fakeFs'), passError(done, function (stats) {
                    expect(stats.isDirectory(), 'to equal', true);
                }));
            });
        });

        describe('#statSync()', function () {
            it.skip('should report the fakeFs entry as a directory', function (done) {
                expect(mountFs.statSync(Path.resolve(__dirname, 'fakeFs')), 'to equal', true);
            });
        });

        describe('with a stat and statSync that throw OUTSIDETREE errors', function () {
            beforeEach(function () {
                mountedFs.stat = sinon.spy(function (path, cb) {
                    process.nextTick(function () {
                        var err = new Error();
                        err.name = 'OUTSIDETREE';
                        err.relativeTargetPath = '../MountFs.js';
                        cb(err);
                    });
                });
                mountedFs.statSync = sinon.spy(function () {
                    var err = new Error();
                    err.name = 'OUTSIDETREE';
                    err.relativeTargetPath = '../MountFs.js';
                    throw err;
                });
            });

            it('should stat MountFs.js when invoking stat on a file inside the directory where the fakeFs is mounted', function (done) {
                mountFs.stat(Path.resolve(__dirname, 'fakeFs', 'baz'), passError(done, function (stats) {
                    expect(stats.isFile(), 'to equal', true);
                    done();
                }));
            });

            it('should stat MountFs.js when invoking statSync on a file inside the directory where the fakeFs is mounted', function () {
                expect(mountFs.statSync(Path.resolve(__dirname, 'fakeFs', 'baz')).isFile(), 'to equal', true);
            });
        });

        describe('#link', function () {
            it('refuses to fs.link out of the mounted fs', function () {
                expect(function () {
                    expect(mountFs.link(__filename, Path.resolve(__dirname, 'fakeFs', 'theTestSuite.js')));
                }, 'to throw', 'mountFs: Cannot fs.link between mounted file systems');
            });

            it('refuses to fs.link into the mounted fs', function () {
                expect(function () {
                    expect(mountFs.link(Path.resolve(__dirname, '..', 'LICENSE'), Path.resolve(__dirname, 'fakeFs', 'theLicense')));
                }, 'to throw', 'mountFs: Cannot fs.link between mounted file systems');
            });

            it('allows linking within the mounted fs', function () {
                mountedFs.linkSync = sinon.spy().named('linkSync');
                mountFs.linkSync(Path.resolve(__dirname, 'fakeFs', 'source.txt'), Path.resolve(__dirname, 'fakeFs', 'target.txt'));
                expect(mountedFs.linkSync, 'was called with', '/source.txt', '/target.txt');
            });
        });

        describe('#rename', function () {
            it('refuses to fs.rename out of the mounted fs', function () {
                expect(function () {
                    expect(mountFs.rename(__filename, Path.resolve(__dirname, 'fakeFs', 'theTestSuite.js')));
                }, 'to throw', 'mountFs: Cannot fs.rename between mounted file systems');
            });

            it('refuses to fs.rename into the mounted fs', function () {
                expect(function () {
                    expect(mountFs.rename(Path.resolve(__dirname, '..', 'LICENSE'), Path.resolve(__dirname, 'fakeFs', 'theLicense')));
                }, 'to throw', 'mountFs: Cannot fs.rename between mounted file systems');
            });

            it('allows renameing within the mounted fs', function () {
                mountedFs.renameSync = sinon.spy().named('renameSync');
                mountFs.renameSync(Path.resolve(__dirname, 'fakeFs', 'source.txt'), Path.resolve(__dirname, 'fakeFs', 'target.txt'));
                expect(mountedFs.renameSync, 'was called with', '/source.txt', '/target.txt');
            });
        });
    });
    describe('with a strict fake fs implementation mounted at <testDir>/fakeFs', function () {
        var fs = require('fs');
        before(function () {
            MountFs.patchInPlace();

            var mountedFs = {
                readFileSync: sinon.spy(function (path) {
                    switch (path) {
                    case '/foo.txt':
                        return 'foofoofoo';
                    case '/foo/bar/baz.txt':
                        return 'foobarbaz';
                    default:
                        throw new Error("Error: ENOENT, no such file or directory '" + path + "'");
                    }
                })
            };

            fs.mount(Path.resolve(__dirname, 'fakeFs'), mountedFs);
        });
        after(function () {
            fs.unmount(Path.resolve(__dirname, 'fakeFs'));
            fs.unpatch();
        });

        it('should be able to read a file from the root of the mounted fs', function () {
            var file = Path.resolve(__dirname, 'fakeFs', 'foo.txt');
            return expect(fs.readFileSync(file), 'to equal', 'foofoofoo');
        });

        it('should be able to read a file from the mounted fs', function () {
            var file = Path.resolve(__dirname, 'fakeFs', 'foo/bar/baz.txt');
            return expect(fs.readFileSync(file), 'to equal', 'foobarbaz');
        });
    });
    describe('with a strict fake fs implementation mounted at /', function () {
        before(function () {
            MountFs.patchInPlace();

            var mountedFs = {
                readFileSync: sinon.spy(function (path) {
                    switch (path) {
                    case '/foo.txt':
                        return 'foofoofoo';
                    case '/foo/bar/baz.txt':
                        return 'foobarbaz';
                    default:
                        throw new Error("Error: ENOENT, no such file or directory '" + path + "'");
                    }
                })
            };

            fs.mount('/', mountedFs);
        });
        after(function () {
            fs.unmount('/');
            fs.unpatch();
        });

        it('should be able to read a file from the root of the mounted fs', function () {
            var file = '/foo.txt';
            return expect(fs.readFileSync(file), 'to equal', 'foofoofoo');
        });

        it('should be able to read a file from the mounted fs', function () {
            var file = '/foo/bar/baz.txt';
            return expect(fs.readFileSync(file), 'to equal', 'foobarbaz');
        });
    });

    describe('with a fake fs implementation mounted at <testDir>/foo/fakeFs', function () {
        var mountedFs,
            mountFs;
        beforeEach(function () {
            mountedFs = {
                readFileSync: sinon.spy(function () {
                    return "foobar";
                }),
                open: sinon.spy(function (path, cb) {
                    setImmediate(function () {
                        cb(null, 42);
                    });
                })
            };
            mountFs = new MountFs();
            mountFs.mount(Path.resolve(__dirname, 'foo', 'fakeFs'), mountedFs);
        });

        describe('#readdir()', function () {
            it('should list "foo" in <testDir>', function (done) {
                mountFs.readdir(__dirname, passError(done, function (names) {
                    expect(names, 'to contain', 'foo');
                    done();
                }));
            });

            it('should list "fakeFs" in <testDir>/foo', function (done) {
                mountFs.readdir(Path.resolve(__dirname, 'foo'), passError(done, function (names) {
                    expect(names, 'to contain', 'fakeFs');
                    done();
                }));
            });
        });

        describe('#readdirSync()', function () {
            it('should list "foo" in <testDir>', function () {
                expect(mountFs.readdirSync(__dirname), 'to contain', 'foo');
            });

            it('should list "fakeFs" in <testDir>/foo', function () {
                expect(mountFs.readdirSync(Path.resolve(__dirname, 'foo')), 'to contain', 'fakeFs');
            });
        });

        describe('#stat()', function () {
            it.skip('should report <testDir>/foo as a directory', function (done) {
                mountFs.stat(Path.resolve(__dirname, 'foo'), passError(done, function (stats) {
                    expect(stats.isDirectory(), 'to equal', true);
                }));
            });
        });

        describe('#statSync()', function () {
            it.skip('should report <testDir>/foo as a directory', function (done) {
                expect(mountFs.statSync(Path.resolve(__dirname, 'foo')), 'to equal', true);
            });
        });
    });

    describe('with a fake fs implementation with support for open and close mounted at <testDir>/fakeFs', function () {
        var mountedFs,
            mountFs;
        beforeEach(function () {
            mountedFs = {
                open: sinon.spy(function (path, mode, cb) {
                    setImmediate(function () {
                        cb(null, 42);
                    });
                }).named('open'),
                close: sinon.spy(function (fd, cb) {
                    setImmediate(cb);
                }).named('close')
            };
            mountFs = new MountFs();
            mountFs.mount(Path.resolve(__dirname, 'fakeFs'), mountedFs);
        });

        describe('#open()', function () {
            it('should call the callback with a file descriptor number', function () {
                var fd;
                return expect.promise(function (run) {
                    mountFs.open(Path.resolve(__dirname, 'fakeFs', 'foo.txt'), 'r', run(function (err, _fd) {
                        fd = _fd;
                        expect(err, 'to be falsy');
                        expect(fd, 'to be greater than', 1000);
                    }));
                }).then(function () {
                    return expect.promise(function (run) {
                        mountFs.close(fd, run());
                    });
                }).then(function () {
                    expect([mountedFs.open, mountedFs.close], 'to have calls satisfying', function () {
                        mountedFs.open('/foo.txt', 'r', expect.it('to be a function'));
                        mountedFs.close(42, expect.it('to be a function'));
                    });
                });
            });
        });
    });

    describe('with a fake fs implementation with support for openSync and closeSync mounted at <testDir>/fakeFs', function () {
        var mountedFs,
            mountFs;
        beforeEach(function () {
            mountedFs = {
                openSync: sinon.stub().named('openSync').returns(42),
                closeSync: sinon.stub().named('closeSync')
            };
            mountFs = new MountFs();
            mountFs.mount(Path.resolve(__dirname, 'fakeFs'), mountedFs);
        });

        describe('#open()', function () {
            it('should call the callback with a file descriptor number', function () {
                var fd = mountFs.openSync(Path.resolve(__dirname, 'fakeFs', 'foo.txt'), 'r');
                expect(fd, 'to be greater than', 1000);
                mountFs.closeSync(fd);
                expect([mountedFs.openSync, mountedFs.closeSync], 'to have calls satisfying', function () {
                    mountedFs.openSync('/foo.txt', 'r');
                    mountedFs.closeSync(42);
                });
            });
        });
    });
});
