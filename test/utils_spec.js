'use strict';

const utils = require('../lib/utils');
const should = require('should');
const fs = require('fs');
const sinon = require('sinon');
const path = require('path');
const sandbox = sinon.sandbox.create();

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

            utils
                .isGreaterThanVersion({
                    greaterVersion: '2.0.0',
                    smallerVersion: '1.0.10'
                })
                .should.eql(true);

            utils
                .isGreaterThanVersion({
                    greaterVersion: '1.10.0',
                    smallerVersion: '1.2.0'
                })
                .should.eql(true);
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

    describe('readFolders', function () {
        beforeEach(function () {
            sandbox.restore();
        });

        it('ensure order', function () {
            sandbox.stub(fs, 'readdirSync').returns(['1.0', '2.0', '2.3', '2.13']);
            let folders = utils.readVersionFolders(path.join(__dirname, 'assets', 'migrations', 'versions'));
            folders.should.eql(['1.0', '2.0', '2.3', '2.13']);
        });

        it('ensure order', function () {
            sandbox.stub(fs, 'readdirSync').returns(['1.1.2', '1.1.0', '0.1']);
            let folders = utils.readVersionFolders(path.join(__dirname, 'assets', 'migrations', 'versions'));
            folders.should.eql(['0.1', '1.1.0', '1.1.2']);
        });

        it('ensure order', function () {
            sandbox.stub(fs, 'readdirSync').returns([
                '1.13',
                '1.18',
                '1.19',
                '1.20',
                '1.21',
                '1.22',
                '1.3',
                '1.4',
                '1.5',
                '1.7',
                '1.9'
            ]);

            let folders = utils.readVersionFolders(path.join(__dirname, 'assets', 'migrations', 'versions'));

            folders.should.eql([
                '1.3',
                '1.4',
                '1.5',
                '1.7',
                '1.9',
                '1.13',
                '1.18',
                '1.19',
                '1.20',
                '1.21',
                '1.22'
            ]);
        });
    });
});
