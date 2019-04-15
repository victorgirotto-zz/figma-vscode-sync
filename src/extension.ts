import * as vscode from 'vscode';
import * as Figma from 'figma-js';
import { CurrentFileUtil } from './util/current-file-util';
import { FigmaComponents } from './figma-components';
import { FigmaLayerProvider, FigmaLayer } from './figma-layer';
import { CssUtil } from './util/css-util';
import { FileStorage } from './util/storage';

const changeWait: number = 1000; // How long we wait before processing a change event
const fileStoragePrefix: string = `files-`; // Prefix with which the file is stored in memory
let changeTimeout: NodeJS.Timeout;
let statusBar: vscode.StatusBarItem;
let figmaLayerProvider: FigmaLayerProvider;
let fileData: FileStorage;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
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
		// Check if a less file is currently open
		if(!CurrentFileUtil.isFileLanguageID('less')){
			// A LESS file is not open
			vscode.window.showErrorMessage('You can only run this command on a LESS file.');
			return;
		}
		
		// A LESS file is open. Begin setup.
		const fileURI = CurrentFileUtil.getOpenFileURIPath();
		if (fileURI){
			const config = vscode.workspace.getConfiguration();
			const token = apiKey ? apiKey : config.get('APIKey') as string;
			const fileKey = fileData.fileKey;

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
					fileData.fileKey = fileKey;
					// Update status bar
					updateStatusBar();
					// Create figma structure
					createFigmaStructure(fileURI);
				}
			});
		}
	};

	/**
	 * Checks whether the figma structure cache is up to date with the one on Figma's server. If yes, just load it.
	 * If it's not up-to-date or if no cache exists, create the structure and cache it.
	 */
	let createFigmaStructure = function(fileURI: string){
		// First create the information message
		statusBar.text = '$(repo-sync) Syncing with api.figma.com';
		// Get data from Figma and parse it
		return new Promise(resolve => {
			const apiKey = vscode.workspace.getConfiguration().get('APIKey') as string;
			const fileKey = fileData.fileKey;

			// Get file data from API
			const client = Figma.Client({ personalAccessToken: apiKey });
			client.file(fileKey).then(({ data }) => {
				// Retrieve cache if any
				let figmaComponents = fileData.components;
				
				// Check if the there is data and if it's is up to date. If not, parse received data.
				if(!figmaComponents || data.lastModified !== figmaComponents.lastModified){
					// Add metadata to the workspace data
					fileData.fileName = data.name;
					// Parse document
					figmaComponents = new FigmaComponents(data);
					// Store components
					fileData.components = figmaComponents;
				}
				
				// Add sidebar item
				createTreeView(figmaComponents);
				// Update status bar
				updateStatusBar();

			}).catch(reason => {
				// Something went wrong while retrieving data from Figma
				vscode.window.showErrorMessage(reason.toString());
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

	let evaluateLine = function(event: vscode.TextDocumentChangeEvent){
		let token = CssUtil.extractToken(event.contentChanges[0].range.start.line);
		console.log(token);
	};

	let createTreeView = function(figmaComponents?: FigmaComponents | undefined){
		let links = fileData.links;
		figmaLayerProvider = new FigmaLayerProvider(figmaComponents, links);
		vscode.window.registerTreeDataProvider('figmaComponents', figmaLayerProvider);
	};

	let refreshSidebar = function(){
		// Get document
		let documentURI = CurrentFileUtil.getOpenFileURIPath();
		if(documentURI){
			// See if it's connected to a figma file
			let fileKey = fileData.fileKey;
			if (fileKey){
				// Get cache structure, if any, and create tree view
				let figmaComponents = fileData.components;
				createTreeView(figmaComponents);
				// If there is a file key, Update the structure
				createFigmaStructure(documentURI);
			} else {
				// It's not connected to a file.
				createTreeView();
			}
		}
	};

	let removeFigmaSync = function(){
		// Removes figma sync
		vscode.window.showQuickPick(['Yes', 'No'], {
			placeHolder: "Remove the connection between this file and Figma?"	
		}).then((result: string | undefined) => {
			if(result && result.toLowerCase() === 'yes'){
				// Remove files
				fileData.clearData();
				// Refresh sidebar and status menu
				refreshSidebar();
				updateStatusBar();
			}	
		});
	};

	let updateStatusBar = function(){
		// Create status bar if it doesn't yet exist
		if (!statusBar){
			statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		}
		
		// Check whether this is a LESS file and that it's being tracked
		let figmaFileKey = fileData.fileKey;
		if(!CurrentFileUtil.isFileLanguageID('less')){
			// It's not a less file or the file is not being synced. Hide the status bar.
			statusBar.hide();
		} else if (!figmaFileKey){
			// It's a less file but no Figma file has been attached
			statusBar.text = `$(circle-slash) Not connected to Figma`;
			statusBar.command = 'figmasync.syncLessFile';
			// Show it
			statusBar.show();
		} else {
			// It's a less file that's being tracked
			statusBar.text = `$(check) Figma: ${fileData.fileName}`;
			statusBar.command = 'figmasync.removeFigmaSync';
			// Show it
			statusBar.show();
		}
	};

	let linkLayerWithSelector = function(layer: FigmaLayer) {
		vscode.window.showInputBox({
			prompt: `Enter the selector you want to link with layer "${layer.label}"`,
			placeHolder: 'selector'
		}).then((selector:string|undefined) => {
			if(selector){
				// Set the link, store it, and refresh the view
				layer.setLink(selector);
				fileData.addLink(layer.id, selector);
				figmaLayerProvider.refresh(layer);
			}
		});
	};

	let handleChangeFile = function(){
		let uri = CurrentFileUtil.getOpenFileURIPath();
		if(uri){
			// Select data storage
			fileData = new FileStorage(uri, context);
			// Update UI
			updateStatusBar();
			refreshSidebar();
		}
	};

	// Commands
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.syncLessFile', () => setupFile()));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.refreshComponents', () => refreshSidebar()));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.removeFigmaSync', () => removeFigmaSync()));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.linkLayer', linkLayerWithSelector));

	// Event handlers
	vscode.workspace.onDidChangeTextDocument(event => handleDocumentChange(event));
	vscode.window.onDidChangeActiveTextEditor(handleChangeFile);
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBar));

	// Run initial functions
	handleChangeFile();

}

export function deactivate() {}
