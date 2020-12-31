// Test js/utils

const expect = require("chai").expect;
const utils = require('../js/utils.js');

describe("Utils", function(){
	it("returns zero on non-numeric attribute", function(){
	  const obj = { foo: 'bar' };
		const res = utils.safeVal(obj, 'foo');
		expect(res).to.equal(0);
	});
	it("returns number on numeric attribute", function(){
	  const obj = { foo: 2 };
		const res = utils.safeVal(obj, 'foo');
		expect(res).to.equal(2);
	});
});
