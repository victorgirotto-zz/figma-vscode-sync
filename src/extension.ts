import * as vscode from 'vscode';
import * as Figma from 'figma-js';
import { CurrentFileUtil } from './util/current-file-util';
import { FigmaDocument } from './figma-document';

const changeWait: number = 1000; // How long we wait before processing a change event
const fileStoragePrefix: string = `files-`; // Prefix with which the file is stored in memory

let changeTimeout: NodeJS.Timeout;
let statusBar: vscode.StatusBarItem;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let evaluateLine = function(event: vscode.TextDocumentChangeEvent){
		let editor = vscode.window.activeTextEditor;
		// Check if there is an open editor
		if(editor){
			// Get line content
			let lineNumber =  event.contentChanges[0].range.start.line;
			let line = CurrentFileUtil.getLine(editor, lineNumber);
			let lineText = line.text;
			// TODO Handle multiple lines. E.g. Check whether line ends with a comma. If so, include all lines until we find either a ; (end of rule) or  { (end of selector)

			// Very simple rules for detecting what kind of content is being edited (e.g. rules, tokens, etc.)
			// TODO make this whole thing more robust. This is mainly a proof of concept at this point.
			if(lineText.trim()[0] === '@' && !lineText.includes('{')){ // Token
				console.log('[Token]');
				
				// Find token name and value;
				let token = getRule(lineText);
				console.log(`${token[0]}: ${token[1]};`);

			} else if (lineText.match(/(.+\:\s*.+\;)/)){ // Rule
				console.log('[Rule]');

				// Find the prop and value
				let rule = getRule(lineText);
				console.log(`${rule[0]}: ${rule[1]};`);

				// Find the parent selectors
				let parents = findParentSelectors(lineNumber, editor);
				console.log(`Parents: ${parents}`);

			} else if (lineText.includes('{')){ // Selector
				console.log('[Selector]');
			}
		}
	};
	
	let findParentSelectors = function(lineNumber: number, editor: vscode.TextEditor): string[]{
		let foreignScope: number = 0; 
		let currLineNumber: number = lineNumber; // Start search one line above current line
		let currLine: vscode.TextLine = CurrentFileUtil.getLine(editor, currLineNumber);
		let parents: string[] = [];

		// Loop while the character is not in the line and there are still lines
		do  {
			// Decrement counter and get character
			currLineNumber = currLineNumber - 1;
			currLine = CurrentFileUtil.getLine(editor, currLineNumber);

			// Check if current line starts or ends a scope
			if (currLine.text.includes('{') && !currLine.text.includes('}')){ // Opening scope
				if(foreignScope === 0){ // There are no foreig scopes
					parents.unshift(getSelector(currLine.text));
				} else {
					// Pop the foreign scope
					foreignScope--;
				}
			} else if (currLine.text.includes('}') && !currLine.text.includes('{')) { // Closing scope
				// Found the end of a scope, which means this is not a parent of the current line. Disable the includeScope var.
				foreignScope++;
			}
		} while(currLineNumber > 0);

		// Return array of parents
		return parents;
	};

	let getSelector = function(lineText: string){
		return lineText.replace('{','').trim();
	};

	let getRule = function(rule:string){
		let split = rule.split(':');
		return [split[0].trim(), split[1].trim().replace(';', '')];
	};

	

	/**
	 * This command setups up sync with a file. If first ensures that an API key is set. If not, it prompts for one.
	 * If the API key is set, it then prompts for the file key that will be synced. If a file key had already been set, the prompt will display it.
	 * If everything is set, it calls the function to build the figma structure.
	 * This command is meant to be used only once to match a code file with a figma file, or to change it to a different one.
	 *
	 * @param apiKey the figma file key. If none is supplied, this method will look into the workspace data and ultimately prompt the user. 	
	 */
	let setupFile = function(apiKey?: string){
		// Check if a less file is currently open
		if(!CurrentFileUtil.isFileLanguageID('less')){
			// A LESS file is not open
			vscode.window.showErrorMessage('You can only run this command on a LESS file.');
			return;
		}
		
		// A LESS file is open. Begin setup.
		const fileURI = CurrentFileUtil.getOpenFileURIPath();
		const config = vscode.workspace.getConfiguration();
		const token = apiKey ? apiKey : config.get('APIKey') as string;
		const fileKey = context.workspaceState.get(fileStoragePrefix + fileURI) as string;

		// Check for the API token
		if(!token){
			// No API Key has been set. Prompt user for it.
			vscode.window.showInputBox({
				prompt: 'Enter your API Key. You can generate an API key by going into Figma > Account Settings > Personal Access Token.' ,
				placeHolder: 'API Key'
			}).then((APIKey) => {
				if(APIKey){
					// Update settings with API key and re-run the file
					config.update('APIKey', APIKey).then(()=>setupFile(APIKey));
				}
			});
			return;
		}

		// Always prompt for file key. If it already exists, populate the prompt with it.
		vscode.window.showInputBox({
			prompt: 'Enter the key for the file you want to sync with. You can get this from the file\'s URL.',
			placeHolder: 'File key',
			value: fileKey
		}).then((fileKey) => {
			if(fileKey){
				// Store file key
				context.workspaceState.update(fileStoragePrefix + fileURI, fileKey);
				// Update status bar
				updateStatusBar();
				// Create figma structure
				createFigmaStructure();
			}
		});
	};

	let updateStatusBar = function(){
		// Create status bar if it doesn't yet exist
		if (!statusBar){
			statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		}
		
		// Check whether this is a LESS file and that it's being tracked
		let fileURI = CurrentFileUtil.getOpenFileURIPath();
		let figmaFileKey = context.workspaceState.get(fileStoragePrefix + fileURI);
		if(!CurrentFileUtil.isFileLanguageID('less') || !figmaFileKey){
			// It's not a less file or the file is not being synced. Hide the status bar.
			statusBar.hide();
			
		} else {
			// It's a less file that's being tracked
			let fileName = context.workspaceState.get(`files-${fileURI}-name`);
			fileName = fileName ? fileName : figmaFileKey;
			statusBar.text = `Figma file: ${fileName}`;
			// Show it
			statusBar.show();
		}
	};

	/**
	 * Checks whether the figma structure cache is up to date with the one on Figma's server. If yes, just load it.
	 * If it's not up-to-date or if no cache exists, create the structure and cache it.
	 */
	let createFigmaStructure = function(){
		// First create the information message
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Getting data from api.figma.com",
			cancellable: false
		}, (progress, token) => {
			// Get data from Figma and parse it
			return new Promise(resolve => {
				const fileURI = CurrentFileUtil.getOpenFileURIPath();
				const token = vscode.workspace.getConfiguration().get('APIKey') as string;
				const fileKey = context.workspaceState.get(`files-${fileURI}`) as string;

				// Get file data from API
				const client = Figma.Client({ personalAccessToken: token });
				client.file(fileKey).then(({ data }) => {
					// Update status
					progress.report({ message: "Data received. Parsing it." });
					// Add metadata to the workspace data
					context.workspaceState.update(`files-${fileURI}-name`, data.name);
					// Update status bar
					updateStatusBar();
					// Parse document
					let figmaDocument = new FigmaDocument(data);				
					// Clear information message
					resolve();
				}).catch(reason => {
					// Somethign went wrong while retrieving data from Figma
					vscode.window.showErrorMessage(reason.toString());
				});
			});
		});
	};

	let handleDocumentChange = function(event: vscode.TextDocumentChangeEvent){
		if(changeTimeout){
			// Another change happened before computing this timeout.
			clearTimeout(changeTimeout);
		}
		// Wait a bit before reacting to change
		changeTimeout = setTimeout(() => {
			evaluateLine(event);
		}, changeWait);
	};

	// Commands
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.syncLessFile', () => setupFile()));

	// Event handlers
	vscode.workspace.onDidChangeTextDocument(event => handleDocumentChange(event));
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBar));

	// Run initial functions
	updateStatusBar();
}

export function deactivate() {}
