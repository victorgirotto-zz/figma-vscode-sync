import * as vscode from 'vscode';
import * as Figma from 'figma-js';
import { FigmaLessParser } from './figmaless';
import { Util } from './util';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	console.log('Activated figma-sync!');

	let out = function (text: string) {
		console.log(text);
	}

	let disposable = vscode.commands.registerCommand('extension.figmaToLess', () => {

		// TODO move to settings
		const token = '11224-5e65e112-a4e8-4195-b72a-4e2f88b8658c';
		const fileKey = 'dhcM7g1aZbRIgcUr2BEcWaYV';

		// Get file data from API
		out(`Retrieving data for file ${fileKey}...`);
		const client = Figma.Client({ personalAccessToken: token });
		client.file(fileKey).then(({ data }) => {

			// Retrieved data. Parse it.
			out('... Done!');
			out('Parsing the data...');
			let figmaLess = new FigmaLessParser(fileKey, data);

			// Done. Print file.
			out('... Done!');
			out('Writing file...');
			let fileString = figmaLess.getFileContentString();
			Util.writeFile(fileString, 'design-system.less');
			out('... Done!');
		});
	});

	// Publish command
	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
