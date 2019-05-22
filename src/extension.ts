import * as vscode from 'vscode';
import { CurrentFileUtil } from './util/current-file-util';
import { FigmaLayer } from './sidebar';
import { WorkspaceState as WorkspaceState, supportedLanguages } from './workspacestate';

let state: WorkspaceState; // The FileState manages the persistant state for every file
let figmaDiagnostics: vscode.DiagnosticCollection; // Diagnostics collection for Figma sync
let documentEditTimeout: NodeJS.Timeout;
let documentEditWait: number = 1000;

export function activate(context: vscode.ExtensionContext) {
	
	/**
	 * This command setups up sync with a file. If first ensures that an API key is set. If not, it prompts for one.
	 * If the API key is set, it then prompts for the file key that will be synced. If a file key had already been set, the prompt will display it.
	 * If everything is set, it calls the function to build the figma structure.
	 * This command is meant to be used only once to match a code file with a figma file, or to change it to a different one.
	 *
	 * @param apiKey the figma file key. If none is supplied, this method will look into the workspace data and ultimately prompt the user. 	
	 */
	let setupFile = function(apiKey?: string){
		const config = vscode.workspace.getConfiguration();
		const token = apiKey ? apiKey : config.get('APIKey') as string;

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
		}).then((fileKey) => {
			if(fileKey){
				// Attach the file
				state.connectFigmaFileKey(fileKey);
			}
		});
	};

	/**
	 * Prompts the user a yes or no question, and executes a resolveFn function when a choice is made
	 * @param placeholder the message the user will be propted with
	 * @param resolveFn The function execute when the choice is made
	 */
	let promptYesOrNo = function(placeholder: string, resolveFn: Function){
		vscode.window.showQuickPick(['Yes', 'No'], {
			placeHolder: placeholder	
		}).then((result: string | undefined) => {
			resolveFn(result);
		});
	};

	/**
	 * Reveals a layer in the sidebar
	 * @param layer 
	 */
	let revealLayer = function(args: any){
		if('layerId' in args){
			state.revealLayerById(args.layerId);
		}
	};

	/**
	 * Shows the css properties for a layer in the sidebar
	 * @param args 
	 */
	let showCssProperties = function(layer: FigmaLayer){
		state.showCssProperties(layer);
	};
	
	/**
	 * Copies a 
	 */
	let copyToClipboard = function(args: any){
		console.log('copy');
		console.log(args);
	};

	/**
	 * Opens a layer in figma
	 */
	let openInFigma = function(layer: FigmaLayer){
		vscode.env.openExternal(vscode.Uri.parse(`https://www.figma.com/file/${layer.fileKey}/?node-id=${layer.layerId}`));
	};
	
	/**
	 * Retrieves the SVG for a layer while informing the user of the status of this process
	 * @param layer 
	 */
	let exportSVG = function(layer: FigmaLayer){
		// Initiate progress notification
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Generating and optimizing the SVG...",
			cancellable: true
		}, (progress, token) => {
			return new Promise(resolve => {
				// Retrieve the SVG. Once done, resolve this promise.
				state.getSVG(layer.fileKey, layer.layerId).then(svg => {
					resolve();
					vscode.env.clipboard.writeText(svg);
					vscode.window.showInformationMessage('SVG copied to the clipboard');
				});
			});
		});
	};

	/**
	 * Extracts all the text values from the layer and its children
	 * @param layer 
	 */
	let extractCopy = function(layer: FigmaLayer){
		// Get text content
		let textContent: string[] = Array.from(new Set(layer.getTextContent())); // Using set to remove duplicates

		// Create new document with the text content and focus on it
		vscode.workspace.openTextDocument({content: textContent.join('\n\n')}).then(textDocument => {
			vscode.window.showTextDocument(textDocument);
		});
	};
	
	/**
	 * Posts a comment at the Figma file
	 * @param layer 
	 */
	let postComment = function(layer: FigmaLayer){
		// First, prompt user for the comment
		vscode.window.showInputBox({
			prompt: `Write the comment. It will be placed over the layer: ${layer.name}`
		}).then(value => {
			if(value){
				// If the user added a comment, post it
				state.postComment(value, layer).then(isPosted => {
					vscode.window.showInformationMessage('Your comment was posted on Figma');
				});			
			}
		});
	};

	/**
	 * Reacts to a document changes after a small delay.
	 * TODO Right now, I parse everything again, which may become very resource intensive. Optimize this.
	 */
	let handleDocumentEdit = function(change: vscode.TextDocumentChangeEvent){};

	/**
	 * Handlers the request to refresh components
	 */
	let refreshComponents = function(){
		loadWorkspaceState(true);
	};

	/**
	 * Handles the event of a user switching to another editor
	 */
	let handleChangeEditor = function(){};

	/**
	 * Instantiates a file state based on persisted data
	 * @param fetchData (optional) boolean indicating whether data should be fetched from the server
	 */
	let loadWorkspaceState = function(fetchData?: boolean){
		let editor = CurrentFileUtil.getCurrentFile();
		if(editor){
			// Instantiate state
			state = new WorkspaceState(context, figmaDiagnostics);
			if(fetchData){
				state.fetchAllFigmaFiles();
			}
		}
	};

	// Initialize variables
	figmaDiagnostics = vscode.languages.createDiagnosticCollection(`figma-sync`);

	// Register Commands
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.syncLessFile', setupFile));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.refreshComponents', refreshComponents));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.revealLayer', revealLayer));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.showCssProperties', showCssProperties));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.copytoclipboard', copyToClipboard));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.openInFigma', openInFigma));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.exportSVG', exportSVG));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.extractCopy', extractCopy));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.postComment', postComment));

	// Event handlers
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(handleChangeEditor));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(handleDocumentEdit));
	
	// Start everything
	loadWorkspaceState(true);
}

export function deactivate() {}
