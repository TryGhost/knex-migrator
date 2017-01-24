var utils = require('../lib/utils');
var should = require('should');

describe('Utils', function () {
    describe('isGreaterThanVersion', function () {
        it('version has this notation: 1.1', function () {
            utils.isGreaterThanVersion({
                greaterVersion: '1.1',
                smallerVersion: '1.0'
            }).should.eql(true);

            utils.isGreaterThanVersion({
                greaterVersion: '2.0',
                smallerVersion: '1.0'
            }).should.eql(true);

            utils.isGreaterThanVersion({
                greaterVersion: '1.0',
                smallerVersion: '2.0'
            }).should.eql(false);
        });

        it('version has this notation: 11', function () {
            utils.isGreaterThanVersion({
                greaterVersion: '11',
                smallerVersion: '10'
            }).should.eql(true);

            utils.isGreaterThanVersion({
                greaterVersion: '20',
                smallerVersion: '10'
            }).should.eql(true);

            utils.isGreaterThanVersion({
                greaterVersion: '10',
                smallerVersion: '20'
            }).should.eql(false);
        });

        it('version has this notation: 11 (INT)', function () {
            utils.isGreaterThanVersion({
                greaterVersion: 11,
                smallerVersion: 10
            }).should.eql(true);

            utils.isGreaterThanVersion({
                greaterVersion: 20,
                smallerVersion: 10
            }).should.eql(true);

            utils.isGreaterThanVersion({
                greaterVersion: 10,
                smallerVersion: 20
            }).should.eql(false);
        });

        it('version has this notation: 1.1.1', function () {
            utils.isGreaterThanVersion({
                greaterVersion: '1.1.2',
                smallerVersion: '1.1.1'
            }).should.eql(true);

            utils.isGreaterThanVersion({
                greaterVersion: '2.0.0',
                smallerVersion: '1.0.0'
            }).should.eql(true);

            utils.isGreaterThanVersion({
                greaterVersion: '1.0.0',
                smallerVersion: '2.0.0'
            }).should.eql(false);
        });

        it('version has this notation: 1', function () {
            utils.isGreaterThanVersion({
                greaterVersion: '1',
                smallerVersion: '1'
            }).should.eql(false);

            utils.isGreaterThanVersion({
                greaterVersion: '2',
                smallerVersion: '1'
            }).should.eql(true);

            utils.isGreaterThanVersion({
                greaterVersion: '1',
                smallerVersion: '2'
            }).should.eql(false);
        });
    });
});