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

		// Get configurations
		const config = vscode.workspace.getConfiguration('figmaSync');
		const token = config.get('APIKey') as string;
		const fileKey = config.get('fileKey') as string;
		const outFileName = config.get('outFileName') ? config.get('outFileName') as string : 'design-system';

		if(!token || !fileKey){
			console.error('You must set both the API key and the File Key in the settings to use Figma Sync');
		} else {
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
				Util.writeFile(fileString, `${outFileName}.less`);
				out('... Done!');
			});
		}

	});

	// Publish command
	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
