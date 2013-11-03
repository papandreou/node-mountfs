var expect = require('unexpected-sinon'),
    sinon = require('sinon'),
    MountFs = require('../lib/MountFs');

describe('MountFs', function () {
    describe('with a fake fs implementation mounted at /foo/bar', function () {
        var mountedFs,
            mountFs;
        beforeEach(function () {
            mountedFs = {readFileSync: sinon.spy(function () {
                return "foobar";
            })};
            mountFs = new MountFs();
            mountFs.mount('/foo/bar', mountedFs);
        });

        it('should proxy to mountedFs.readFileSync and strip away /foo/bar from the path', function () {
            mountFs.readFileSync('/foo/bar/quux');
            expect(mountedFs.readFileSync, 'was called once');
            expect(mountedFs.readFileSync, 'was called with', '/quux');
        });

        it('should proxy readFile outside a mounted location to the built-in fs module', function () {
            mountFs.readFileSync(__filename);
            expect(mountedFs.readFileSync, 'was not called');
        });
    });
});
