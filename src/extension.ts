import * as vscode from 'vscode';
import { CurrentFileUtil } from './util/current-file-util';
import { FigmaLayer } from './sidebar';
import { WorkspaceState as WorkspaceState } from './workspacestate';
import { stat } from 'fs';
import { LayerSelectorLink } from './link';

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
	 * Stops syncing with this file
	 */
	let unlinkFile = function(layer: FigmaLayer){
		// Removes figma sync for this file
		promptYesOrNo(`Unlink the Figma file "${layer.name}"?`, (result: string | undefined) => {
			if(result && result.toLowerCase() === 'yes'){
				// Remove files
				state.unlinkFigmaFile(layer.fileId);
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
	 * 
	 * @param layer 
	 */
	let linkLayer = function(layer: FigmaLayer){
		if(state.isLayerLinked(layer)){
			// A link already exists. Prompt about removing it.
			promptYesOrNo('Do you want to remove all links for this layer?', (result: string | undefined) => {
				if(result && result === 'Yes'){
					state.removeLayerLink(layer);
				}
			});
		} else {
			// There is no link. Prompt for layer.
			chooseSelectorPrompt(layer);
		}
	};

	/**
	 * 
	 * @param layer 
	 */
	let chooseSelectorPrompt = function(layer: FigmaLayer){
		// Get list of selectors to populate quickpick
		let allSelectors = state.selectors;

		// Prompt user
		vscode.window.showQuickPick(allSelectors, {
			placeHolder: `Choose the selector you want to link with layer "${layer.name}"`			
		}).then((selector: string | undefined) => {
			// Check if a selector was chosen
			if(!selector){
				// Delete link for the layer
				state.removeLayerLink(layer);
			} else {
				// Set link
				let scope = state.getScopeByFullSelector(selector);
				if(scope){
					// Found scope. Add link.
					state.addLink(layer, scope);
				}
			}
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
	 * Highlights the linked elements in their respective views
	 * @param args 
	 */
	let showLink = function(link: LayerSelectorLink){
		state.revealLayerById(link.layerId);
		state.highlightScopeByName(link.scopeId);
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
		
		// vscode.env.openExternal(vscode.Uri.parse(`https://www.figma.com/file/${state.fileKey}/?node-id=${layer.id}`));
	};

	/**
	 * Reacts to a document changes after a small delay.
	 * TODO Right now, I parse everything again, which may become very resource intensive. Optimize this.
	 */
	let handleDocumentEdit = function(){
		// if(documentEditTimeout){
		// 	clearTimeout(documentEditTimeout);
		// }
		// documentEditTimeout = setTimeout(() => { 
		// 	loadWorkspaceState(false); 
		// }, documentEditWait);
	};

	/**
	 * Handlers the request to refresh components
	 */
	let refreshComponents = function(){
		loadWorkspaceState(true);
	};

	/**
	 * Handles the event of a user switching to another editor
	 */
	let handleChangeEditor = function(){
		// loadWorkspaceState(true);
	};

	/**
	 * Instantiates a file state based on persisted data
	 * @param fetchData (optional) boolean indicating whether data should be fetched from the server
	 */
	let loadWorkspaceState = function(fetchData?: boolean){
		let editor = CurrentFileUtil.getCurrentFile();
		if(editor){
			// Instantiate state
			state = new WorkspaceState(editor, context, figmaDiagnostics);
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
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.unlinkFile', unlinkFile));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.linkLayer', linkLayer));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.revealLayer', revealLayer));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.showCssProperties', showCssProperties));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.showLink', showLink));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.copytoclipboard', copyToClipboard));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.openInFigma', openInFigma));

	// Event handlers
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(handleChangeEditor));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(handleDocumentEdit));
	
	// Start everything
	loadWorkspaceState(true);
}

export function deactivate() {}
