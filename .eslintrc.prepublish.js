module.exports = {
	...require('./.eslintrc.js'),
	rules: {
		...require('./.eslintrc.js').rules,
		'no-console': 'error',
	},
};
