module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: './tsconfig.json',
		sourceType: 'module',
	},
	ignorePatterns: ['dist/**', 'node_modules/**', 'gulpfile.js'],
	plugins: ['n8n-nodes-base'],
	extends: ['plugin:n8n-nodes-base/community'],
	rules: {
		// Allow console for debugging during development
		'no-console': 'warn',
		// n8n specific rules
		'n8n-nodes-base/node-param-description-missing-final-period': 'off',
		'n8n-nodes-base/node-param-description-excess-final-period': 'off',
	},
};
