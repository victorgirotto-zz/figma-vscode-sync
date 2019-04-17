import * as vscode from 'vscode';
import * as Figma from 'figma-js';
import { CurrentFileUtil } from './util/current-file-util';
import { FigmaFile } from './figmafile';
import { FigmaLayer } from './figmalayer';
import { FileState } from './filestate';

let state: FileState; // The FileState manages the persistant state for every file

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
			const fileKey = state.fileKey;

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
					// Attach the file
					state.attachFile(fileKey);
				}
			});
		}
	};

	let removeFigmaSync = function(){
		// Removes figma sync
		vscode.window.showQuickPick(['Yes', 'No'], {
			placeHolder: "Remove the connection between this file and Figma?"	
		}).then((result: string | undefined) => {
			if(result && result.toLowerCase() === 'yes'){
				// Remove files
				state.detachFile();
			}	
		});
	};

	/**
	 * 
	 * @param layer 
	 */
	let linkLayer = function(layer: FigmaLayer){
		// Get list of selectors to populate quickpick
		let allSelectors = state.selectors;

		// Prompt user
		vscode.window.showQuickPick(allSelectors, {
			placeHolder: `Choose the selector you want to link with layer "${layer.name}"`			
		}).then((selector: string | undefined) => {
			// Check if a selector was chosen
			if(!selector){
				// Delete link for the layer
				// state.removeLayerLink(layer);
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
	 * Instantiates a file state based on persisted data
	 */
	let switchContextToCurrentFile = function(){
		let editor = CurrentFileUtil.getCurrentFile();
		if(editor){
			// Instantiate state
			state = new FileState(editor, context);
		}
	};

	// Register Commands
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.syncLessFile', setupFile));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.refreshComponents', switchContextToCurrentFile));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.removeFigmaSync', removeFigmaSync));
	context.subscriptions.push(vscode.commands.registerCommand('figmasync.linkLayer', linkLayer));

	// Event handlers
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(switchContextToCurrentFile));

	// Reset everything
	switchContextToCurrentFile();
}

export function deactivate() {}
