var expect = require('unexpected-sinon'),
    Path = require('path'),
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
            var content = mountFs.readFileSync(Path.resolve(__dirname, '..', 'package.json'));
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
            it.skip('should include a fakeFs entry in the results for the test directory', function (done) {
                mountFs.readdir(__dirname, passError(done, function (names) {
                    expect(names, 'to contain', 'fakeFs');
                }));
            });
        });

        describe('#readdirSync()', function () {
            it.skip('should include a fakeFs entry in the results for the test directory', function () {
                expect(mountFs.readdirSync(__dirname), 'to contain', 'fakeFs');
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
    });
});
