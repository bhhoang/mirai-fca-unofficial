const chalk = require('chalk');
//const notifier = require('node-notifier');

module.exports = (str, end) => {
	console.log(chalk.hex('#32a8a4')(`${end} >> `) + str);
};
